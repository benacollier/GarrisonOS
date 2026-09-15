# GarrisonOS: Architecture Specification & Bootstrap Blueprint

GarrisonOS is a zero-dependency, open-source property management platform engineered for independent property managers, self-managing landlords, and small real estate operators managing portfolios of up to 50 units (single-family residences, small multifamily properties, and scattered sites).

This document serves as the canonical architectural blueprint, engineering standard, domain specification, and step-by-step execution roadmap for bootstrapping the repository and delivering the MVP.

---

## 1. Non-Negotiable Engineering Guardrails

1. **Zero External Runtime Dependencies:**
   - **Backend Engine:** Relies exclusively on the Node.js standard library (`node:http`, `node:sqlite`, `node:crypto`, `node:async_hooks`, `node:events`, `node:fs`, `node:path`, `node:test`, `node:assert`). No npm runtime packages (no Express, Fastify, Drizzle, Prisma, TypeORM, Zod, or external UUID libraries). Only compile-time `@types/node` and `typescript` are permitted as development dependencies.
   - **Frontend Presentation:** Relies exclusively on native PHP (standard extensions: `pdo_sqlite`, `curl`, `session`, `filter`) and semantic HTML5 with vanilla CSS Custom Properties. No Composer packages, Tailwind build steps, Webpack/Vite bundles, or client-side JavaScript frameworks.

2. **Code Attribution & Quality:**
   - Write clean, concise, idiomatic, professional human-grade code.
   - Forbid generic placeholder comments (e.g., `// TODO: Implement your logic here`).
   - Commit messages must follow standard conventional commit syntax (e.g., `feat(core): add request context store`).

3. **Strict Multi-Tenancy & Row-Level Isolation:**
   - Every operational database table MUST include a `tenant_id TEXT NOT NULL` column.
   - Tenant context must be resolved via `AsyncLocalStorage` from the `X-Tenant-ID` header.
   - Business services and repositories must NEVER accept `tenant_id` from request bodies or URL parameters; it must always be pulled implicitly from the request execution context.
   - All database queries must enforce tenant isolation in `WHERE` clauses, supported by compound indexes `(tenant_id, ...)`.

4. **Identity & Data Representation Standards:**
   - **Primary Keys:** RFC 9562 **UUIDv7** (time-sortable, 48-bit UNIX timestamp + sub-millisecond precision + random bits) generated natively via `node:crypto.randomBytes()`.
   - **Currency & Financials:** Stored strictly as **INTEGER cents** (e.g., \$1,500.00 = `150000`). Floating-point arithmetic for currency is strictly prohibited.
   - **Timestamps:** Stored strictly as **INTEGER milliseconds** (UTC epoch ms via `Date.now()`).
   - **Soft Deletes:** Standardized `deleted_at INTEGER` column across all operational entity tables (NULL if active, timestamp ms if deleted).

5. **Standard Dialect-Agnostic SQL & Atomic Transactions:**
   - Write standard ANSI SQL queries that remain portable and engine-agnostic.
   - Database operations use parameterized queries exclusively to guarantee protection against SQL injection.
   - Multi-step operations (e.g., lease signing with deposits, move-out disposition, recurring rent generation) must execute inside atomic transactions using a native `db.transaction((tx) => ...)` wrapper.

6. **Decoupled API-First Architecture:**
   - The PHP presentation layer MUST NOT connect directly to the SQLite database.
   - The PHP frontend communicates with the Core Engine purely via internal HTTP REST calls, forwarding session authentication, user context, and the active `X-Tenant-ID`.

7. **Security & Session Hygiene:**
   - State-modifying requests submitted from the PHP presentation layer require cryptographically secure session CSRF tokens (`$_SESSION['csrf_token']`).
   - Public authentication endpoints enforce sliding-window in-memory rate limiting against brute-force attacks.
   - Passwords hashed using native `node:crypto.scrypt` with a 16-byte random salt and verified via `node:crypto.timingSafeEqual`.

8. **Drop-in Modular Architecture:**
   - Feature domains live in self-contained directories under `modules/[module_name]/`.
   - The Core Engine must auto-discover and load module migrations, backend routes, event listeners, and frontend navigation/slots dynamically at boot.
   - Modules must remain loosely coupled; cross-module communication is conducted via the asynchronous in-process Event Bus.

9. **Purity of Repository:**
   - This codebase is 100% pure open-source GarrisonOS. Do not reference downstream, commercial, or proprietary forks anywhere in the code, comments, or documentation.

---

## 2. Target Directory Structure

```text
garrison-os/
├── .github/
│   └── workflows/
│       ├── ci.yml             # Automated build and test workflow
│       └── cla.yml            # Automated CLA Assistant check workflow
├── .env.example
├── .gitignore
├── AGENTS.md                  # Contributor & engineering guardrails
├── CONTRIBUTING.md            # Contribution guide & dual-licensing policy
├── LICENSE                    # AGPLv3 with Section 7(b) UI attribution addendum
├── package.json               # Zero runtime dependencies (typescript, @types/node)
├── tsconfig.json              # Strict TypeScript compiler configuration
│
├── docs/                      # Comprehensive Documentation Hierarchy
│   ├── README.md
│   ├── architecture/
│   ├── modules/
│   ├── api/
│   ├── development/
│   ├── deployment/
│   └── legal/
│
├── core/                      # Engine Foundation & Runtime
│   ├── context.ts             # AsyncLocalStorage tenant & user context
│   ├── crypto.ts              # Native RFC 9562 UUIDv7 generator, scrypt hashing, auth tokens
│   ├── events.ts              # Native EventEmitter event bus
│   ├── storage.ts             # Native node:fs file storage abstraction & local driver
│   ├── module-loader.ts       # Dynamic scanner & registry for /modules
│   └── index.ts
│
├── api/                       # Zero-Dependency HTTP Layer
│   ├── router.ts              # Native HTTP router (methods, regex/params, body parsing)
│   ├── middleware.ts          # Tenant resolution, auth verification, CORS, rate limiting
│   ├── response.ts            # Standardized JSON response envelopes & status codes
│   ├── server.ts              # Native node:http server harness & health checks
│   └── index.ts
│
├── database/                  # Storage Engine & Migrations
│   ├── client.ts              # node:sqlite client with WAL mode, pragmas & transaction helper
│   ├── migrator.ts            # Native SQL migration runner with _migrations tracker
│   ├── seed.ts                # Deterministic date-relative 20-unit sample portfolio seeder
│   └── migrations/            # Core system migrations
│       └── 0001_core_schema.sql
│
├── modules/                   # Drop-in Functional Modules
│   ├── properties/            # Portfolios, Properties, and Units
│   ├── contacts/              # Humans directory (tenants, owners, vendors, emergency)
│   ├── leases/                # Lease agreements, terms & lease_contacts junction
│   ├── accounting/            # Cash-basis ledger, billing cycles, Schedule E & balances
│   └── maintenance/           # Work order tracking, vendor dispatch, cost conversion
│
├── web/                       # Presentation Layer (Native PHP / Semantic HTML5)
│   ├── index.php              # Front controller, CSRF validator & dynamic page dispatcher
│   ├── lib/                   # Native cURL client, auth, CSRF, and slot hooks
│   ├── templates/             # Layouts, navigation, headers, and flash alerts
│   ├── pages/                 # Dashboard, login, and error pages
│   └── public/                # Design tokens (CSS Custom Properties), styles, minimal JS
│
└── test/                      # Native node:test & node:assert Suite
    ├── helpers.ts             # In-memory SQLite fixtures & mock HTTP harnesses
    ├── crypto.test.ts         # UUIDv7 format, bit validation & scrypt hashing tests
    ├── context.test.ts        # AsyncLocalStorage propagation & concurrency tests
    ├── isolation.test.ts      # Cross-tenant data isolation & leak prevention tests
    ├── router.test.ts         # Route matching, parameter extraction, body parsing tests
    └── modules.test.ts        # Module auto-discovery & migration runner tests
```

---

## 3. Drop-in Module Standard Specification

Every functional module under `modules/[module_name]/` must adhere strictly to the following contract:

### 3.1. Module Manifest (`module.json`)

```json
{
  "id": "properties",
  "name": "Properties & Portfolios",
  "version": "1.0.0",
  "description": "Management of portfolios, physical properties, and rentable units.",
  "navigation": [
    {
      "label": "Properties",
      "route": "/properties",
      "icon": "building",
      "order": 10,
      "section": "core"
    }
  ],
  "slots": [
    "dashboard.metrics",
    "property.details.tabs"
  ],
  "dependencies": []
}
```

### 3.2. Backend Contracts (`backend/`)
* **`migrations/`**: Sequentially numbered SQL migrations prefixed with module identifier (e.g., `0001_properties.sql`). Executed automatically on boot.
* **`routes.ts`**: Exports `registerRoutes(router: Router): void`. Routes are mounted under `/api/v1/[module_id]`.
* **`events.ts`**: Exports `registerSubscribers(eventBus: EventBus): void`.
* **`repository.ts`**: Encapsulates all SQL execution, strictly accepting only the tenant context from `RequestContext.get()` and query arguments.

### 3.3. Frontend Contracts (`frontend/`)
* **`hooks.php`**: Registers navigation links, dashboard summary cards, and detail view tabs with the central hook registry.
* **`pages/`**: PHP view scripts dispatched dynamically by `web/index.php` when navigating to `/[module_name]/[view]`.

### 3.4. Test Contracts (`test/`)
* **`[module_name].test.ts`**: Co-located unit and integration test suite executing under native `node:test` and `node:assert`. Covers module repositories, route endpoints, lifecycle states, and tenant context isolation. Automatically discovered and executed on `npm test`.

---

## 4. MVP Domain Entities & Schemas

### 4.1. Core System Schema (`database/migrations/0001_core_schema.sql`)

```sql
-- Schema version tracking
CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    module TEXT NOT NULL,
    applied_at INTEGER NOT NULL
);

-- Multi-tenant accounts
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE,
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);

-- System operators and users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'assistant', 'read_only')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email) WHERE deleted_at IS NULL;

-- Immutable Audit Log Trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'login', 'billing_run')),
    changes_json TEXT,
    ip_address TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity ON audit_logs(tenant_id, entity_type, entity_id);

-- File attachments & document metadata
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(tenant_id, entity_type, entity_id);
```

### 4.2. Properties Module (`modules/properties/backend/migrations/0001_properties.sql`)

```sql
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
```

### 4.3. Contacts Module (`modules/contacts/backend/migrations/0001_contacts.sql`)

```sql
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
```

### 4.4. Leases Module (`modules/leases/backend/migrations/0001_leases.sql`)

```sql
-- Lease contracts
CREATE TABLE IF NOT EXISTS leases (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
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
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (unit_id) REFERENCES units(id)
);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_unit ON leases(tenant_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_status_dates ON leases(tenant_id, status, start_date, end_date);

-- Lease-to-Contact Junction (Multi-tenant signing parties)
CREATE TABLE IF NOT EXISTS lease_contacts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    lease_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary_tenant', 'co_tenant', 'guarantor', 'occupant')),
    is_financially_responsible INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (lease_id) REFERENCES leases(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lease_contacts_unique ON lease_contacts(tenant_id, lease_id, contact_id) WHERE deleted_at IS NULL;
```

### 4.5. Accounting Module (`modules/accounting/backend/migrations/0001_accounting.sql`)

```sql
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
```

#### Financial Logic & Calculation Standards:
1. **Running Tenant Balance**:
   $$\text{Tenant Balance} = \sum (\text{charges} + \text{deposit\_returns} + \text{deposit\_deductions}) - \sum (\text{payments} + \text{refunds})$$
   *(Positive balance indicates amount owed by tenant; zero is paid in full; negative is credit balance).*

2. **Payment Allocation Priority (Application of Funds)**:
   When partial payments are recorded against an outstanding ledger, funds are applied in strict hierarchy:
   $$\text{Late Fees} \longrightarrow \text{Utility Rebill / Other Charges} \longrightarrow \text{Oldest Rent Charges} \longrightarrow \text{Current Rent}$$

3. **Security Deposit Trust Disposition at Move-Out**:
   $$\text{Final Refund Amount} = \text{Deposit Held} - (\text{Unpaid Rent Charges} + \text{Itemized Damage Deductions})$$
   * When deductions occur, a `deposit_deduction` transaction converts trust liability into operating income or expense reimbursement.

4. **Automated Monthly Recurring Rent Generation**:
   * Endpoint: `POST /api/v1/accounting/generate-rent-charges`
   * Idempotency Key: `rent_charge:{lease_id}:{YYYY_MM}`
   * Mid-month proration formula for new leases:
     $$\text{Prorated Rent Cents} = \left\lfloor \frac{\text{Monthly Rent Cents}}{\text{Days in Month}} \times \text{Days Remaining (inclusive)} \right\rfloor$$

5. **Schedule E Tax & Net Operating Income (NOI)**:
   $$\text{NOI} = \sum \text{Operating Income (Rent, Fees)} - \sum \text{Operating Expenses (Schedule E Categories)}$$

### 4.6. Maintenance Module (`modules/maintenance/backend/migrations/0001_maintenance.sql`)

```sql
-- Work Orders and Repair Tracking
CREATE TABLE IF NOT EXISTS work_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    unit_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled')),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
    category TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'cosmetic', 'pest', 'other')),
    permission_to_enter INTEGER NOT NULL DEFAULT 1,
    entry_instructions TEXT,
    requested_by_contact_id TEXT,
    vendor_contact_id TEXT,
    scheduled_date INTEGER,
    completed_date INTEGER,
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
    actual_cost_cents INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (unit_id) REFERENCES units(id),
    FOREIGN KEY (requested_by_contact_id) REFERENCES contacts(id),
    FOREIGN KEY (vendor_contact_id) REFERENCES contacts(id)
);
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_status ON work_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_property ON work_orders(tenant_id, property_id, unit_id);
```

---

## 5. Core Engine & Subsystems Architecture

### 5.1. Context Propagation (`core/context.ts`)
Encapsulates request isolation via `node:async_hooks.AsyncLocalStorage`.
```typescript
export interface RequestContext {
  tenantId: string;
  userId?: string;
  correlationId: string;
}
```
* Methods: `RequestContext.run(context, fn)`, `RequestContext.get(): RequestContext`, `RequestContext.getTenantId(): string`.
* Throws `Error('No active request context')` if accessed outside an active context.

### 5.2. Native RFC 9562 UUIDv7 & Cryptography (`core/crypto.ts`)
1. **UUIDv7 Generator**: Generates 128-bit time-ordered UUIDv7 identifiers using `node:crypto.randomBytes`:
   * **Bits 0–47**: 48-bit UNIX timestamp (milliseconds).
   * **Bits 48–51**: Version `7` (`0b0111`).
   * **Bits 52–63**: 12-bit random data (or sub-millisecond sequence).
   * **Bits 64–65**: Variant `2` (`0b10`).
   * **Bits 66–127**: 62-bit random entropy.
2. **Password Hashing**: Formats hashes as `$scrypt$N=16384,r=8,p=1$salt$hash` using `node:crypto.scrypt` with 16-byte random salt and constant-time comparison via `node:crypto.timingSafeEqual`.
3. **Session Tokens**: Stateless HMAC-SHA256 tokens signed with `APP_SECRET`.

### 5.3. In-Process Event Bus (`core/events.ts`)
Decoupled asynchronous cross-module messaging using `node:events.EventEmitter`:
* Standard event catalog:
  * `lease.activated`: `{ leaseId, unitId, tenantId, rentAmountCents }`
  * `lease.terminated`: `{ leaseId, unitId, tenantId }`
  * `payment.recorded`: `{ transactionId, leaseId, amountCents, tenantId }`
  * `work_order.completed`: `{ workOrderId, propertyId, unitId, actualCostCents, tenantId }`
    *(Auto-triggers optional recording of an accounting expense transaction).*

### 5.4. Local Storage Driver (`core/storage.ts`)
* Abstract `StorageDriver` interface: `save(path, buffer, mimeType)`, `read(path)`, `delete(path)`, `exists(path)`.
* `LocalDiskStorageDriver` implementation uses `node:fs/promises`, sanitizes path traversal attempts, and stores files with sanitized UUID names in partitioned directories (`uploads/YYYY/MM/uuid`).

### 5.5. Dynamic Module Loader (`core/module-loader.ts`)
1. Scans `modules/` using `node:fs.readdirSync()`.
2. Reads and validates each `module.json` manifest.
3. Automatically applies any pending SQL migrations in `modules/[name]/backend/migrations/` via `database/migrator.ts`.
4. Imports and mounts routes from `modules/[name]/backend/routes.ts` under `/api/v1/[name]`.
5. Binds event subscribers from `modules/[name]/backend/events.ts` to `core/events.ts`.

---

## 6. Zero-Dependency API Layer

### 6.1. Native HTTP Router (`api/router.ts`)
* Built directly on `node:http.IncomingMessage` and `node:http.ServerResponse`.
* Supports standard HTTP verbs: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
* Route parameter extraction (e.g., `/api/v1/properties/:id/units/:unitId`).
* Automatic streaming JSON request body parser with a 1MB default payload ceiling.

### 6.2. Standard Response Envelopes (`api/response.ts`)
All REST endpoints return standardized JSON structures:

```typescript
// Success Response (HTTP 200/201)
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 25
  }
}

// Error Response (HTTP 4xx/5xx)
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR" | "NOT_FOUND" | "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL_ERROR",
    "message": "Human-readable description of error",
    "details": []
  }
}
```

### 6.3. Middleware Pipeline (`api/middleware.ts`)
1. **Correlation ID**: Extract `X-Request-ID` or generate new UUIDv7.
2. **Security Headers**: Set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'self'`.
3. **Sliding-Window Rate Limiting**: In-memory IP/tenant rate limiter on `/api/v1/auth/*` (max 5 failed attempts per 15 minutes).
4. **Tenant Resolution**: Extract `X-Tenant-ID`. If missing on tenant-scoped routes, reject immediately with `400 Bad Request`.
5. **Execution Wrapper**: Wrap downstream handler inside `RequestContext.run({ tenantId, userId, correlationId }, handler)`.
6. **Global Error Trap**: Catch unhandled exceptions and format safe 500 JSON responses.

### 6.4. Data Portability & Backup Endpoints
* `GET /api/v1/accounting/export/rent-roll.csv`: Streams standard CSV Rent Roll.
* `GET /api/v1/accounting/export/schedule-e.csv`: Streams IRS Schedule E year-end income & expense breakdown.
* `GET /api/v1/accounting/export/ledger/:leaseId.csv`: Streams itemized tenant ledger statement.
* `GET /api/v1/system/backup`: Safely creates a WAL-checkpointed snapshot of the SQLite database.

---

## 7. Native PHP Presentation Layer

### 7.1. Front Controller & CSRF Protection (`web/index.php`)
* Initializes PHP session and loads `web/lib/api.php`, `web/lib/auth.php`, `web/lib/csrf.php`, and `web/lib/hooks.php`.
* Validates CSRF token on all incoming `POST`, `PUT`, and `DELETE` requests before dispatching.
* Resolves request URIs:
  * Static core routes: `/`, `/login`, `/dashboard`.
  * Dynamic module routes: `/[module_name]/[action]` $\rightarrow$ Dispatches to `modules/[module_name]/frontend/pages/[action].php`.
* Catches API errors and injects session flash alerts.

### 7.2. Native API Client (`web/lib/api.php`)
* Wraps PHP `curl_init()` to communicate with Node.js engine at `http://127.0.0.1:3000`.
* Forwards `X-Tenant-ID` from `$_SESSION['tenant_id']`, `X-User-ID` from `$_SESSION['user_id']`, and `Authorization: Bearer <token>`.
* Automatically decodes JSON envelopes, raising structured exceptions on API errors.

### 7.3. UI Slot & Hook System (`web/lib/hooks.php`)
* Scans all `modules/*/frontend/hooks.php` at runtime.
* Modules register:
  * **Sidebar Navigation items** (with icons and sort order).
  * **Dashboard Metric Cards** (Occupancy rate, Delinquent amount, Expiring leases count, Open work orders).
  * **Detail View Extension Tabs** (e.g., Tenant Payment History tab, Unit Work Orders tab).

### 7.4. Semantic HTML5 & Vanilla CSS Design System (`web/public/css/`)
* Uses CSS Custom Properties for typography, colors, borders, shadows, and light/dark theme variables.
* Fully responsive layout using CSS Grid and Flexbox without utility frameworks.
* Native HTML `<dialog>` for modal interactions and accessible semantic tables for ledger data.

