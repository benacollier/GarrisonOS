# SQLite WAL Backup & Maintenance

GarrisonOS uses SQLite in Write-Ahead Logging (`WAL`) mode with `synchronous = NORMAL` and `busy_timeout = 5000`. This provides high-concurrency read operations while serializing writes.

---

## 1. Modular Backup System (`modules/backup`)

GarrisonOS packages a native, zero-dependency Backup Module exposing administrative and tenant-level backup and restoration endpoints:

* `GET /api/v1/backups`: Lists active backups for the tenant context.
* `POST /api/v1/backups`: Triggers either a point-in-time full database snapshot (`full_system`) or an isolated tenant data export (`tenant_data`).
* `POST /api/v1/backups/:id/verify`: Validates the physical file against its recorded SHA-256 checksum.
* `POST /api/v1/backups/:id/restore`: Restores tenant data in **Clean-Slate** (replace) or **Merge** (upsert) mode.

### What Happens Internally

1. Executes `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL log frames into the main database file.
2. Uses SQLite's online `VACUUM INTO` command to generate an uncorrupted snapshot.
3. Streams through native Node.js `node:zlib` Gzip compression.
4. Computes SHA-256 checksum for integrity assurance.

---

## 2. Full System Disaster Recovery CLI

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

## 2. Cron-Based Backup Recipe

You can establish automated daily backups using standard Linux utilities:

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

## 3. Database Vacuuming & Optimization

Over months of operations, deleting records may leave unused pages in the SQLite database file. Periodically vacuuming reorganizes the file:

```bash
# Optimize query planner statistics
sqlite3 garrison.sqlite "PRAGMA optimize;"

# Reclaim unused disk space
sqlite3 garrison.sqlite "VACUUM;"
```
