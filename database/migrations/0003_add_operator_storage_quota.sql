-- Drop legacy backward-compatibility view if present
DROP VIEW IF EXISTS tenants;

-- Add storage_quota_bytes to operators table (default 10 GB: 10737418240 bytes)
ALTER TABLE operators ADD COLUMN storage_quota_bytes INTEGER NOT NULL DEFAULT 10737418240;
