-- Lease contracts
CREATE TABLE IF NOT EXISTS leases (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'expiring', 'renewed', 'terminated', 'month_to_month')),
    start_date INTEGER NOT NULL,
    end_date INTEGER NOT NULL,
    rent_amount_cents INTEGER NOT NULL,
    security_deposit_cents INTEGER NOT NULL DEFAULT 0,
    deposit_held_cents INTEGER NOT NULL DEFAULT 0,
    rent_due_day INTEGER NOT NULL DEFAULT 1,
    late_fee_grace_days INTEGER NOT NULL DEFAULT 5,
    late_fee_amount_cents INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (operator_id) REFERENCES operators(id),
    FOREIGN KEY (unit_id) REFERENCES units(id)
);
CREATE INDEX IF NOT EXISTS idx_leases_operator_unit ON leases(operator_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_operator_status_dates ON leases(operator_id, status, start_date, end_date);

-- Lease-to-Contact Junction (Multi-party signing parties)
CREATE TABLE IF NOT EXISTS lease_contacts (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    lease_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary_tenant', 'co_tenant', 'guarantor', 'occupant')),
    is_financially_responsible INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (operator_id) REFERENCES operators(id),
    FOREIGN KEY (lease_id) REFERENCES leases(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lease_contacts_unique ON lease_contacts(operator_id, lease_id, contact_id) WHERE deleted_at IS NULL;

