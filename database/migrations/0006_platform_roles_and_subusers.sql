-- Migration 0006: Platform Roles, Subusers, and Scoped Portfolio/Module Access
ALTER TABLE users ADD COLUMN is_system_user INTEGER NOT NULL DEFAULT 0 CHECK (is_system_user IN (0, 1));

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
