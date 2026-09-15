-- Chart of Accounts and QuickBooks Compatibility Schema
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    account_number TEXT,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN (
        'Bank',
        'AccountsReceivable',
        'OtherCurrentAsset',
        'AccountsPayable',
        'OtherCurrentLiability',
        'Equity',
        'Income',
        'Expense',
        'CostOfGoodsSold'
    )),
    qb_account_type TEXT NOT NULL,
    category_mapping TEXT, -- maps to GarrisonOS transaction category or special roles ('operating_bank', 'trust_bank', 'accounts_receivable', etc.)
    description TEXT,
    is_system_default INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_coa_tenant_active ON chart_of_accounts(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_coa_tenant_mapping ON chart_of_accounts(tenant_id, category_mapping);

-- QuickBooks Export & Sync Audit Logs
CREATE TABLE IF NOT EXISTS quickbooks_export_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    export_type TEXT NOT NULL CHECK (export_type IN ('qbo_csv', 'iif', 'ofx')),
    transaction_count INTEGER NOT NULL,
    total_debit_cents INTEGER NOT NULL,
    total_credit_cents INTEGER NOT NULL,
    exported_by_user_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_qb_export_tenant_created ON quickbooks_export_logs(tenant_id, created_at);

-- QuickBooks Metadata and Sync Status on Transactions
-- (Alter table safe check / columns if not existing)
ALTER TABLE transactions ADD COLUMN qb_exported_at INTEGER;
ALTER TABLE transactions ADD COLUMN qb_txn_id TEXT;
ALTER TABLE transactions ADD COLUMN qb_class_name TEXT;

