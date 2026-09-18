-- Role Permissions Overrides Table for Configurable RBAC
CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    role TEXT NOT NULL,
    permission TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (operator_id) REFERENCES operators(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_op_role_perm ON role_permissions(operator_id, role, permission);
