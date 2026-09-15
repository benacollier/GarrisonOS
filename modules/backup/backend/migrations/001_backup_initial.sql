-- Backup records tracking schema
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

