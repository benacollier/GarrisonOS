-- Portfolios (Legal ownership entities / LLCs)
CREATE TABLE IF NOT EXISTS portfolios (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    tax_id TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_portfolios_tenant ON portfolios(tenant_id);

-- Physical Properties / Buildings
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    portfolio_id TEXT,
    name TEXT NOT NULL,
    property_type TEXT NOT NULL CHECK (property_type IN ('single_family', 'multi_family', 'condo', 'townhouse', 'commercial')),
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    year_built INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_portfolio ON properties(tenant_id, portfolio_id);

-- Rentable Units
CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('vacant', 'occupied', 'notice_given', 'turnover', 'maintenance_hold')),
    bedrooms INTEGER NOT NULL DEFAULT 1,
    bathrooms REAL NOT NULL DEFAULT 1.0,
    square_feet INTEGER,
    market_rent_cents INTEGER NOT NULL DEFAULT 0,
    target_deposit_cents INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (property_id) REFERENCES properties(id)
);
CREATE INDEX IF NOT EXISTS idx_units_tenant_property ON units(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant_status ON units(tenant_id, status);
