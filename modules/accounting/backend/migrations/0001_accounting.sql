-- Single-entry cash-basis ledger aligned with IRS Schedule E
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'charge',           -- Invoiced amount owed by tenant
        'payment',          -- Inflow payment received from tenant
        'expense',          -- Outflow paid for property maintenance/operations
        'refund',           -- Money returned to tenant
        'deposit_inflow',   -- Security deposit collected into trust
        'deposit_return',   -- Security deposit returned to tenant at move-out
        'deposit_deduction' -- Security deposit applied to unpaid rent/damages
    )),
    category TEXT NOT NULL CHECK (category IN (
        -- Income Categories
        'rent', 'late_fee', 'pet_fee', 'utility_rebill', 'security_deposit', 'other_income',
        -- IRS Schedule E Operating Expense Categories
        'advertising', 'auto_travel', 'cleaning_maintenance', 'commissions', 'insurance',
        'legal_professional', 'management_fees', 'mortgage_interest', 'other_interest',
        'repairs', 'supplies', 'property_taxes', 'utilities', 'hoa_fees', 'capital_improvement'
    )),
    amount_cents INTEGER NOT NULL, -- Always positive integer cents
    transaction_date INTEGER NOT NULL,
    description TEXT NOT NULL,
    payment_method TEXT CHECK (payment_method IN ('zelle', 'check', 'cash', 'ach', 'direct_deposit', 'credit_card', 'other')),
    reference_number TEXT,
    property_id TEXT,
    unit_id TEXT,
    lease_id TEXT,
    payer_contact_id TEXT,
    payee_contact_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (unit_id) REFERENCES units(id),
    FOREIGN KEY (lease_id) REFERENCES leases(id),
    FOREIGN KEY (payer_contact_id) REFERENCES contacts(id),
    FOREIGN KEY (payee_contact_id) REFERENCES contacts(id)
);
CREATE INDEX IF NOT EXISTS idx_tx_tenant_lease_date ON transactions(tenant_id, lease_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_tenant_property_date ON transactions(tenant_id, property_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_tenant_type_category ON transactions(tenant_id, transaction_type, category);

