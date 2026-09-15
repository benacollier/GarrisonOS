-- Individual humans & organizations directory
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('tenant', 'owner', 'vendor', 'guarantor', 'prospect', 'emergency')),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    company_name TEXT,
    email TEXT,
    phone TEXT,
    secondary_phone TEXT,
    tax_id_last4 TEXT,
    vendor_specialty TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_type ON contacts(tenant_id, contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name ON contacts(tenant_id, last_name, first_name);

