# SQLite WAL Backup & Maintenance

GarrisonOS uses SQLite in Write-Ahead Logging (`WAL`) mode with `synchronous = NORMAL` and `busy_timeout = 5000`. This provides high-concurrency read operations while serializing writes.

---

## 1. Automated Snapshot Backup Endpoint

The core engine provides an administrative backup endpoint:

```bash
curl -X GET http://127.0.0.1:3000/api/v1/system/backup \
  -H "X-Tenant-ID: <admin_tenant_id>" \
  -H "Authorization: Bearer <admin_token>"
```

### What Happens Internally
1. Executes `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL log frames into the main `.sqlite` file.
2. Uses SQLite's online backup API or atomic filesystem copy to generate a timestamped snapshot in `storage/backups/`.

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
