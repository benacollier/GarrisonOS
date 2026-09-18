-- Migration 0004: Universal Document Attachments & Media

-- Safely replace legacy stub from 0001 if present
DROP TABLE IF EXISTS attachments;

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    entity_type TEXT NOT NULL, -- 'lease', 'property', 'unit', 'contact', 'work_order', 'bill'
    entity_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    is_sanitized INTEGER NOT NULL DEFAULT 1 CHECK (is_sanitized IN (0, 1)),
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attachments_operator_entity ON attachments(operator_id, entity_type, entity_id) WHERE deleted_at IS NULL;
