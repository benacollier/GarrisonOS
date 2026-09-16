-- Add token_version column to users table for stateless token revocation
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;

-- Create index for efficient version lookups
CREATE INDEX IF NOT EXISTS idx_users_tenant_token_version ON users(tenant_id, token_version);
