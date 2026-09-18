-- Migration 0006: Platform Roles, Subusers, and Scoped Portfolio/Module Access

-- Rebuild users table with forward-compatible expanded role CHECK constraint and is_system_user column
CREATE TABLE IF NOT EXISTS users_new (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'assistant', 'read_only', 'maintenance', 'auditor', 'viewer', 'system_owner', 'system_manager', 'leasing_agent')),
    token_version INTEGER NOT NULL DEFAULT 1,
    is_system_user INTEGER NOT NULL DEFAULT 0 CHECK (is_system_user IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (operator_id) REFERENCES operators(id)
);

INSERT INTO users_new (
    id, operator_id, email, password_hash, first_name, last_name, role,
    token_version, is_system_user, created_at, updated_at, deleted_at
)
SELECT
    id, operator_id, email, password_hash, first_name, last_name, role,
    token_version, 0, created_at, updated_at, deleted_at
FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_operator_email ON users(operator_id, email) WHERE deleted_at IS NULL;

-- Scoped portfolio access for subusers
CREATE TABLE IF NOT EXISTS user_portfolio_access (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    portfolio_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (operator_id) REFERENCES operators(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_portfolio_access_unique ON user_portfolio_access(operator_id, user_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_user_portfolio_access_lookup ON user_portfolio_access(operator_id, user_id);

-- Scoped module access for subusers
CREATE TABLE IF NOT EXISTS user_module_access (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    module_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (operator_id) REFERENCES operators(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_module_access_unique ON user_module_access(operator_id, user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_user_module_access_lookup ON user_module_access(operator_id, user_id);
