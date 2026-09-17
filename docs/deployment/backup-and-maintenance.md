# SQLite WAL Backup & Maintenance

GarrisonOS uses SQLite in Write-Ahead Logging (`WAL`) mode with `synchronous = NORMAL` and `busy_timeout = 5000`. This provides high-concurrency read operations while serializing writes.

---

## 1. Modular Backup System (`modules/backup`)

GarrisonOS packages a native, zero-dependency Backup Module exposing administrative and tenant-level backup, restoration, and scheduling endpoints:

* `GET /api/v1/backups`: Lists active backups for the tenant context with defensive `limit` and `offset` pagination.
* `POST /api/v1/backups`: Triggers either a point-in-time full database snapshot (`full_system`) or an isolated tenant data export (`tenant_data`).
* `GET /api/v1/backups/:id`: Retrieves metadata for a specific backup record.
* `GET /api/v1/backups/:id/download`: Streams backup archives with path-traversal guards.
* `POST /api/v1/backups/:id/verify`: Validates the physical file against its recorded SHA-256 checksum.
* `POST /api/v1/backups/:id/restore`: Restores tenant data in **Clean-Slate** (replace) or **Merge** (upsert) mode.
* `DELETE /api/v1/backups/:id`: Soft-deletes the database record and unlinks physical archives from disk.
* `GET /api/v1/backups/scheduler/status`: Returns background scheduler status, intervals, and maintenance states.
* `POST /api/v1/backups/scheduler/trigger`: Triggers on-demand scheduled backup or vacuum maintenance routines (owner-only).

### What Happens Internally

1. Executes `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL log frames into the main database file.
2. Uses SQLite's online `VACUUM INTO` command to generate an uncorrupted snapshot.
3. Streams through native Node.js `node:zlib` Gzip compression.
4. Computes SHA-256 checksum for integrity assurance.

---

## 2. In-Process Scheduler Daemon (`BackupScheduler`)

GarrisonOS includes an automated background scheduler daemon managing recurring full database snapshots, retention pruning, and database vacuuming without external dependencies or cron jobs.

### Configuration Options

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `BACKUP_SCHEDULE_ENABLED` | `true` (dev/prod), `false` (test) | Enables the in-process background scheduler daemon |
| `BACKUP_INTERVAL_HOURS` | `24` | Interval in hours between automated point-in-time database backups |
| `BACKUP_RETENTION_DAYS` | `30` | Threshold in days for purging expired backup records and archives |
| `BACKUP_VACUUM_INTERVAL_HOURS` | `168` (7 days) | Interval in hours between database vacuum and WAL checkpoint maintenance runs |

### Worker Thread Isolation

To preserve responsive HTTP API throughput and avoid blocking the Node.js event loop during heavy I/O, database vacuuming and WAL truncation checkpoint operations execute inside a dedicated background worker thread (`maintenance-worker.ts`).

---

## 3. Full System Disaster Recovery CLI

For offline instance recovery:

```bash
# Safely restore full SQLite database from snapshot
node scripts/restore.js storage/backups/garrison-db-<timestamp>.sqlite.gz
```

The script:

1. Validates SQLite binary format header (`SQLite format 3`).
2. Purges stale `-wal` and `-shm` cache files to prevent corruption.
3. Overwrites the database and automatically applies pending migrations (`runMigrations()`).

---

## 4. Optional External Cron Recipe

While GarrisonOS includes an automated internal scheduler, operators may optionally establish host-level backups using standard Linux utilities:

```bash
# /etc/cron.daily/garrison-backup
#!/bin/bash
BACKUP_DIR="/var/backups/garrison"
mkdir -p "$BACKUP_DIR"

# Perform safe live backup using sqlite3 CLI
sqlite3 /var/www/garrison-os/garrison.sqlite ".backup '$BACKUP_DIR/garrison_$(date +\%Y\%m\%d_\%H\%M\%S).sqlite'"

# Retain backups for 30 days
find "$BACKUP_DIR" -type f -name "*.sqlite" -mtime +30 -delete
```

---

## 5. Database Vacuuming & Optimization

Over months of operations, deleting records may leave unused pages in the SQLite database file. Periodically vacuuming reorganizes the file:

The in-process scheduler delegates these synchronous SQLite operations to a dedicated worker thread. WAL truncation checkpoints the write-ahead log, `PRAGMA optimize` updates query-planner statistics, and `VACUUM` separately reclaims unused database pages.

```bash
# Optimize query planner statistics
sqlite3 garrison.sqlite "PRAGMA optimize;"

# Reclaim unused disk space
sqlite3 garrison.sqlite "VACUUM;"
```
