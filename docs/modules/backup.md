# Backup & Disaster Recovery Module Specification

The **Backup & Disaster Recovery Module** (`modules/backup/`) provides zero-dependency, automated and on-demand database backup, tenant data portability, integrity verification, and restore capabilities.

---

## 1. Capabilities & Architectural Scope

| Capability | Scope | Mechanism |
| :--- | :--- | :--- |
| **Full System Database Backup** | Instance Level (Admin) | SQLite WAL checkpoint + `VACUUM INTO` + Gzip stream (`.sqlite.gz`) |
| **Tenant Data Export** | Tenant Level | Dynamic tenant table extraction + JSON formatting + Gzip (`.json.gz`) |
| **Integrity Verification** | Both | SHA-256 hash computed on completion, validated on-demand |
| **Tenant Data Restore** | Tenant Level | Atomic import (`withTransaction`) with **Clean-Slate** or **Merge** options |
| **Disaster Recovery Restore** | Instance Level | Offline CLI script (`scripts/restore.js`) with binary header check and WAL cache wipe |

---

## 2. Database Schema (`backups`)

```sql
CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    backup_type TEXT NOT NULL, -- 'full_system' | 'tenant_data'
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    checksum_sha256 TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed'
    error_message TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backups_tenant_created 
ON backups (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backups_tenant_status 
ON backups (tenant_id, status);
```

---

## 3. REST API Endpoints

All endpoints require standard `X-Tenant-ID` header and authentication tokens.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/backups` | List backups for the active tenant context (paginated) |
| `POST` | `/api/v1/backups` | Trigger new backup (`{ "type": "tenant_data" \| "full_system" }`) |
| `GET` | `/api/v1/backups/:id` | Get backup metadata, size, checksum, and status |
| `GET` | `/api/v1/backups/:id/download` | Stream download backup archive with path-traversal guard |
| `POST` | `/api/v1/backups/:id/verify` | Run SHA-256 integrity verification against the physical file |
| `POST` | `/api/v1/backups/:id/restore` | Restore tenant data (`{ "mode": "clean_slate" \| "merge" }`) |
| `DELETE` | `/api/v1/backups/:id` | Soft-delete record and unlink physical archive from storage |
| `GET` | `/api/v1/backups/scheduler/status` | Get background scheduler running state, intervals, next runs, and metrics |
| `POST` | `/api/v1/backups/scheduler/trigger` | Owner-only trigger for an immediate scheduled backup or vacuum (`{ "action": "vacuum" }`) |

---

## 4. Automated Background Scheduler & Maintenance Daemon

The module includes an in-process, zero-dependency background daemon (`BackupScheduler` in `modules/backup/backend/scheduler.ts`) managing recurring system resilience routines without external cron requirements.

### Capabilities & Schedules

1. **Automated Point-in-Time Snapshots**:
   - Executes periodic WAL checkpoints (`PRAGMA wal_checkpoint(TRUNCATE);`) and compressed database backups (`garrison-db-<timestamp>.sqlite.gz`).
   - Computes SHA-256 integrity checksums and records backups in the audit registry.
   - Emits `backup.scheduled.completed` or `backup.scheduled.failed` events over `EventBus`.
2. **Database Maintenance & Vacuuming**:
   - Runs periodic WAL truncation, query optimizer statistics updates (`PRAGMA optimize;`), and disk page reclamation (`VACUUM;`) on a dedicated worker thread so synchronous SQLite maintenance does not block the server event loop.
   - Emits `database.vacuumed` events with duration and checkpoint metrics.
3. **Retention Policy Pruning**:
   - Automatically unlinks and soft-deletes backup archives exceeding `BACKUP_RETENTION_DAYS`.

### Configuration Knobs

| Environment Variable | Default | Description |
| :--- | :---: | :--- |
| `BACKUP_SCHEDULE_ENABLED` | `true` | Enable or disable the in-process background scheduler. |
| `BACKUP_INTERVAL_HOURS` | `24` | Hours between automated full system database snapshots (greater than 0, at most 596). |
| `BACKUP_RETENTION_DAYS` | `30` | Days to retain backup archives before automated pruning. |
| `BACKUP_VACUUM_INTERVAL_HOURS` | `168` | Hours between database vacuum and page reclamation routines (greater than 0, at most 596; default: 7 days). |

---

## 5. Restoration Modes

### Tenant-Level Restoration (`tenant_data`)

1. **Clean-Slate (Replace)**:
   - Deletes existing tenant records in the backed-up tables before inserting snapshot records.
   - Ideal for rolling back unintentional data alterations or deletions.
2. **Merge / Upsert**:
   - Updates or inserts matching records from the snapshot by primary key.
   - Preserves newly created records added since the backup was taken.
3. **Multi-Tenancy Guard**:
   - The backup metadata is strictly validated against `RequestContext.getTenantId()`. A tenant is strictly barred from restoring another tenant's archive.

### Full System Disaster Recovery (`full_system`)

Executed via the standalone CLI tool:

```bash
node scripts/restore.js storage/backups/garrison-db-1726380000000.sqlite.gz
```

1. Inspects and extracts archive to a temporary file.
2. Validates SQLite binary format magic header (`SQLite format 3`).
3. Closes active database connection handles.
4. Cleans up stale WAL and shared-memory files (`garrison.sqlite-wal`, `garrison.sqlite-shm`) to prevent write-ahead log replay corruption.
5. Creates a backup timestamp of the existing database.
6. Overwrites `garrison.sqlite` with the restored snapshot.
7. Automatically executes database migrations (`runMigrations()`) to catch up any newer schema changes.
