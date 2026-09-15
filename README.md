# GarrisonOS

> An open-source, modular, zero-dependency, lightweight property management framework designed to liberate property managers from closed vendor lock-in, inflexible data schemas, and proprietary software silos.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Pre--Production%20Prototype-yellow.svg)](#pre-production-disclaimer)
[![Node.js](https://img.shields.io/badge/Node.js-v22.5%2B-green.svg)](https://nodejs.org/)
[![PHP](https://img.shields.io/badge/PHP-8.2%2B-purple.svg)](https://www.php.net/)
[![Dependencies](https://img.shields.io/badge/Runtime_Dependencies-0-brightgreen.svg)](#dependencies--runtime-prerequisites)
[![Multi-Tenancy](https://img.shields.io/badge/Multi--Tenancy-Row--Level_Isolation-orange.svg)](#architectural-principles)

---

> [!WARNING]
>
> ## Pre-Production Disclaimer
>
> GarrisonOS is currently in **pre-production prototyping** and active development. This software is **not ready for production use and should not be installed or deployed by end users** until an official, stable release is made available. Core APIs, internal schemas, and functionality remain subject to breaking changes without notice. Developers and contributors are welcome to explore and test the codebase in isolated development environments.

---

## Overview

GarrisonOS is engineered to provide self-managing landlords, independent property managers, and small real estate operators with a modern, privacy-respecting, self-hosted property management suite.

The software addresses day-to-day operational tasks, cash-basis accounting, and structured recordkeeping without the recurring subscription costs, vendor lock-in, or opaque data silos imposed by legacy property management platforms.

Built from first principles around **zero external runtime dependencies**, GarrisonOS operates entirely on the standard libraries of Node.js and native PHP, backed by an embedded SQLite engine operating in Write-Ahead Logging (WAL) mode.

---

## Target MVP Scope

The GarrisonOS MVP is focused strictly on delivering a self-hosted property management suite tailored for **small residential portfolios (up to 50 units)**, including single-family residences, duplexes/triplexes/fourplexes, small multifamily buildings, and scattered sites.

### In Scope for MVP

* **Day-to-Day Operations**: Physical property structures, rentable unit inventories, status lifecycle tracking, human directory management (tenants, owners, vendors, emergency contacts), and maintenance work order dispatching.
* **Lease Agreements**: Residential lease lifecycles, terms, security deposit tracking, and multi-party signatory assignments.
* **Cash-Basis Accounting & Recordkeeping**: Single-entry cash ledger mapped to IRS Schedule E categories, tenant running balances, automated monthly rent charge generation with mid-month proration, waterfall payment allocation, move-out deposit disposition, and streamed CSV exports (Rent Roll, Schedule E P&L, itemized tenant statements).
* **Self-Hosting & Privacy**: Single-tenant or multi-tenant deployment, local SQLite database storage, and complete data portability.

---

## Architectural Principles

1. **Zero External Runtime Dependencies**:
   * **Backend Engine**: Built exclusively on native Node.js standard modules (`node:http`, `node:sqlite`, `node:crypto`, `node:async_hooks`, `node:events`, `node:fs`, `node:path`, `node:test`, `node:assert`). No npm packages at runtime (no Express, Fastify, Prisma, TypeORM, Zod, uuid, or bcrypt).
   * **Frontend Presentation**: Built exclusively on native PHP 8.2+ with standard built-in extensions (`pdo_sqlite`, `curl`, `session`, `filter`) and semantic HTML5 with vanilla CSS Custom Properties. No Composer packages, CSS preprocessors, or frontend JavaScript frameworks.
2. **Strict Multi-Tenancy & Row-Level Isolation**:
   * Every operational database table includes a `tenant_id TEXT NOT NULL` column referencing `tenants(id)`.
   * Tenant context is extracted from request headers (`X-Tenant-ID`) or authenticated session tokens and propagated down the execution stack using `AsyncLocalStorage`.
   * Repositories and business logic resolve `tenant_id` implicitly from execution context—never from untrusted request bodies or URL parameters.
3. **Financial Precision & Tax Alignment**:
   * All currency values are strictly stored and calculated as **INTEGER cents** (e.g., $1,450.00 is stored as `145000`). Floating-point arithmetic for currency is strictly prohibited.
   * Single-entry cash-basis ledger mapped to standard IRS Schedule E expense categories for tax preparation and Net Operating Income (NOI) calculation.
4. **Deterministic Identity & Time Standards**:
   * **Primary Keys**: RFC 9562 **UUIDv7** (time-ordered 128-bit UUIDs generated natively via `node:crypto.randomBytes`).
   * **Timestamps**: Stored strictly as **INTEGER milliseconds** (UTC epoch ms via `Date.now()`).
   * **Soft Deletes**: Standardized `deleted_at INTEGER` timestamp column across all entity tables (`NULL` when active).
5. **Decoupled API-First Architecture**:
   * The core Node.js engine exposes a zero-dependency HTTP REST API.
   * The native PHP frontend communicates with the engine via internal loopback HTTP requests, forwarding user session context, authentication tokens, and tenant headers.
6. **Drop-in Modularity**:
   * Domain features are encapsulated in self-contained directories under `modules/[module_name]/` containing their own migrations, backend routes, event subscribers, repositories, and frontend views/hooks.

---

## Dependencies & Runtime Prerequisites

GarrisonOS is intentionally architected with **zero external runtime package dependencies**.

### Backend Engine

* **Runtime**: [Node.js](https://nodejs.org/) `v22.5.0` or newer (`v24.x LTS` recommended for built-in `node:sqlite` support).
* **Standard Library Modules Utilized**:
  * `node:http`: Low-latency HTTP server, custom streaming JSON parser, and REST router.
  * `node:sqlite`: Synchronous embedded SQLite database engine with WAL mode and transaction wrapper.
  * `node:crypto`: RFC 9562 UUIDv7 generator, `scrypt` password hashing with salt, and HMAC-SHA256 token signing.
  * `node:async_hooks`: `AsyncLocalStorage` tenant context store.
  * `node:events`: In-process asynchronous `EventBus` for cross-module events.
  * `node:fs` / `node:fs/promises`: Local disk file storage driver and dynamic module loader.
  * `node:path`: Filesystem path normalization and traversal prevention.
  * `node:test` & `node:assert`: Native automated test runner and assertion library.
* **Build-Time Development Dependencies** (zero runtime footprint):
  * `typescript` (`^5.8.0`): Static typing and compilation to ES2022 JavaScript.
  * `@types/node` (`^24.0.0`): TypeScript definitions for Node.js standard modules.

### Frontend Presentation Layer

* **Runtime**: [PHP](https://www.php.net/) `8.2` or newer.
* **Standard PHP Extensions Required**:
  * `curl`: HTTP client for backend REST API communication.
  * `session`: Secure session management and CSRF token persistence.
  * `filter`: Input validation and sanitization.
  * `pdo_sqlite`: Standard SQLite database driver extension.
* **Client-Side Stack**:
  * Semantic HTML5.
  * Vanilla CSS with CSS Custom Properties (supports Light and Dark themes).
  * Minimal progressive enhancement JavaScript (no client-side build pipeline required).

### Storage & Database

* **Database**: Embedded SQLite 3 (managed natively via `node:sqlite`).
* **Database Modes**: Write-Ahead Logging (`PRAGMA journal_mode = WAL`), Foreign Key enforcement (`PRAGMA foreign_keys = ON`), Busy Timeout (`PRAGMA busy_timeout = 5000`).
* **File Attachments**: Local disk storage partitioned by year, month, and UUID.

---

## Target MVP Capabilities

```text
┌────────────────────────────────────────────────────────────────────────┐
│                              GarrisonOS                                │
├──────────────┬──────────────┬──────────────┬─────────────┬─────────────┤
│  Properties  │   Contacts   │    Leases    │ Accounting  │ Maintenance │
│ & Portfolios │  Directory   │  Agreements  │  & Ledger   │ Work Orders │
└──────────────┴──────────────┴──────────────┴─────────────┴─────────────┘
```

### 1. Properties & Portfolios (`modules/properties`)

* **Legal Portfolios**: Organize holdings by legal entity / LLC with tax identification.
* **Physical Properties**: Manage Single-Family Homes, Multifamily Buildings, Condominiums, Townhouses, and Commercial spaces with address, year built, and metadata.
* **Rentable Units**: Track unit inventories, unit numbers, bedroom/bathroom configurations, square footage, market rent, and target deposits.
* **Unit Lifecycle States**: `vacant`, `occupied`, `notice_given`, `turnover`, and `maintenance_hold`.

### 2. Contacts Directory (`modules/contacts`)

* **Unified Humans Directory**: Centralized management of tenants, property owners, maintenance vendors, co-signers/guarantors, prospects, and emergency contacts.
* **Vendor Profiles**: Specialization tracking (plumbing, electrical, HVAC, general repair, roofing, turnover cleaning).
* **Communication & Identity**: Primary/secondary phone numbers, email addresses, tax IDs, and entity linkages.

### 3. Lease Management (`modules/leases`)

* **Contract Lifecycle**: `draft` $\rightarrow$ `active` $\rightarrow$ `expiring` $\rightarrow$ `renewed` $\rightarrow$ `terminated` / `month_to_month`.
* **Terms & Financials**: Recurring rent amount, security deposit requirements, deposit held, rent due day, late fee grace periods, and late fee amounts.
* **Multi-Party Signatories**: `lease_contacts` junction supporting Primary Tenants, Co-Tenants, Guarantors, and Occupants with financial responsibility tracking.

### 4. Cash-Basis Accounting & Financials (`modules/accounting`)

* **Single-Entry Ledger**: Real-time transaction logging for charges, tenant payments, operating expenses, refunds, and security deposit trust activity.
* **IRS Schedule E Tax Mapping**: Categorization mapped directly to IRS Schedule E expense lines (Advertising, Cleaning & Maintenance, Insurance, Legal/Professional, Management Fees, Mortgage Interest, Repairs, Supplies, Property Taxes, Utilities, HOA Fees, Capital Improvements).
* **Running Tenant Balances**: Real-time balance computation:
  $$\text{Tenant Balance} = \sum (\text{charges} + \text{deposit\_returns} + \text{deposit\_deductions}) - \sum (\text{payments} + \text{refunds})$$
* **Strict Payment Allocation Waterfall**: When partial payments are recorded, funds apply in strict order:
  $$\text{Late Fees} \longrightarrow \text{Utility Rebill / Fees} \longrightarrow \text{Oldest Rent Charges} \longrightarrow \text{Current Rent}$$
* **Move-Out Deposit Disposition**: Automatic computation of deposit refunds minus unpaid rent and itemized damage deductions.
* **Automated Monthly Rent Generation**: Scheduled batch generation with idempotency keys (`rent_charge:{lease_id}:{YYYY_MM}`) and mid-month proration calculations.
* **Financial Data Exports**: Streamed CSV generation for Rent Roll, Schedule E income/expense statements, and tenant ledgers.
* **Chart of Accounts & QuickBooks Compatibility**: Customizable standard Chart of Accounts (Bank, AR, Liabilities, Income, Schedule E Expenses), balanced double-entry journal preview, and universal exports for QuickBooks Online (`.csv`), QuickBooks Desktop (`.iif`), and Web Connect bank feeds (`.qbo`).

### 5. Maintenance & Work Orders (`modules/maintenance`)

* **Work Order Tracking**: Lifecycle management (`open`, `assigned`, `in_progress`, `on_hold`, `completed`, `cancelled`).
* **Triage & Priority**: Low, Medium, High, and Emergency priority matrix across trade categories (Plumbing, Electrical, HVAC, Appliance, Structural, Cosmetic, Pest).
* **Access Control**: Permission-to-enter tracking and custom entry instructions.
* **Vendor Assignment & Cost Conversion**: Vendor assignment, scheduled repair dates, estimated vs. actual costs, with automatic creation of accounting expenses upon completion via the Event Bus.

### 6. Backup & Disaster Recovery (`modules/backup`)
* **Point-in-Time SQLite Snapshots**: Safe WAL checkpointing and online SQLite `VACUUM INTO` snapshots with gzip compression (`.sqlite.gz`).
* **Tenant Data Portability**: Tenant-isolated data export and restore (`.json.gz`) with user-selectable **Clean-Slate** (replace) or **Merge** (upsert) modes.
* **Integrity Hashing**: Cryptographic SHA-256 integrity verification upon creation and on-demand.
* **CLI Disaster Recovery Tool**: Standalone `node scripts/restore.js <path-to-snapshot>` utility with binary header validation and stale WAL cleanup.

### 7. Web Presentation Layer & Executive Dashboard (`web/`)

* **Executive KPI Dashboard**: Real-time portfolio summary cards (occupancy rate %, monthly rent roll total, outstanding delinquency amount, open work order count).
* **Security & Session Hygiene**: Cryptographic CSRF validation on all state-modifying requests, timing-safe credential verification, and sliding-window rate limiting on authentication routes.
* **Dynamic Hook & Slot System**: Dynamic navigation menu aggregation, dashboard summary card registration, and detail tab extensions.
* **Responsive UI Design System**: Clean typography, light/dark theme toggle, native HTML `<dialog>` modals, and accessible ledger tables.

---

## Project Milestones

| Milestone | Focus Area | Status | Description |
| :--- | :--- | :---: | :--- |
| **Milestone 1** | **Foundation & Core Subsystems** | Completed | Zero-dependency Node.js HTTP engine, `AsyncLocalStorage` multi-tenant context, embedded SQLite WAL engine, native RFC 9562 UUIDv7 generator, `scrypt` hashing, dynamic module loader, and native `node:test` suite. |
| **Milestone 2** | **Residential Domain Modules** | Completed | Data schemas, migrations, repositories, and REST endpoints for Properties & Units, Contacts Directory, Leases & Signatories, Cash-Basis Schedule E Accounting, and Maintenance Work Orders. |
| **Milestone 3** | **Presentation Layer & UI** | Completed | Native PHP front controller, CSRF protection, executive KPI dashboard, dynamic module navigation/slot aggregators, and responsive semantic HTML5/CSS design system. |
| **Milestone 4** | **Automation & Financial Workflows** | Completed | Automated recurring monthly rent charge generation with mid-month proration, 4-tier waterfall payment allocation, move-out deposit disposition, CSV export endpoints (Rent Roll, Schedule E, Tenant Ledgers), and SQLite backup snapshotting. |
| **Milestone 5** | **Testing & Production Hardening** | In Progress | Full automated test suite coverage (crypto, context isolation, multi-tenant leaks, ledger math, proration, routing), seed data fixtures, self-hosting documentation, and production runtime hardening. |
| **Milestone 6** | **Self-Hosting Packaging & Distribution** | Planned | Docker compose deployment recipes, systemd service templates, automated backup rotation scripts, and one-click self-hosting guides. |

---

## Future Horizons (Out of Scope for MVP)

To maintain focus, agility, and uncompromising simplicity, commercial-grade and enterprise-scale features are **strictly out of scope for the current MVP**. They are cataloged here for future roadmap consideration:

* **Commercial Real Estate Management**:
  * Triple Net (NNN) lease contracts, Common Area Maintenance (CAM) reconciliations, and expense stop calculations.
  * Retail percentage rent based on tenant sales reporting.
  * CPI-indexed and fixed annual lease escalation schedules.
* **Enterprise Accounting & Finance**:
  * Formal trust/escrow bank account compliance reporting and statutory audits.
  * Integrated payment processing gateways (direct ACH debit, credit card rails) and automated live bank feeds (Plaid API sync).
  * Automated 1099-MISC / 1099-NEC vendor tax form generation and e-filing.
* **Portals & External Interfaces**:
  * Dedicated self-service Tenant Portal (online payments, maintenance ticket submission, lease document downloads).
  * Dedicated Property Owner Portal (monthly distribution statements, capital expense approval workflows).
  * Native iOS / Android mobile applications.
* **Marketing & Syndication**:
  * Automated vacancy syndication to listing aggregators (Zillow, Apartments.com, Realtor.com).
  * Online rental application processing, background screening, and credit check integrations.
* **Enterprise Identity & Governance**:
  * Single Sign-On (SSO) via SAML 2.0 / OpenID Connect (OIDC).
  * Hierarchical multi-branch organizational structures with granular role-based access control (RBAC).

---

## Directory Structure

```text
garrison-os/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Automated build and test pipeline
│       └── cla.yml                # Automated Contributor License Agreement check
├── .env.example                   # Environment configuration template
├── .gitignore
├── AGENTS.md                      # Contributor rules & engineering guardrails
├── CONTRIBUTING.md                # Contribution guide & development workflow
├── LICENSE                        # AGPLv3 with Section 7(b) UI attribution addendum
├── package.json                   # Zero runtime dependencies (typescript, @types/node)
├── tsconfig.json                  # Strict TypeScript compiler options
│
├── docs/                          # Comprehensive Documentation Hierarchy
│   ├── README.md                  # Documentation navigation index
│   ├── architecture/              # Core engine, multi-tenancy, data model & blueprints
│   ├── modules/                   # Properties, contacts, leases, accounting, maintenance
│   ├── api/                       # REST API endpoints & EventBus catalog
│   ├── development/               # Getting started, frontend guide & testing standards
│   ├── deployment/                # Self-hosting, configuration & SQLite WAL maintenance
│   └── legal/                     # Contributor License Agreement (CLA)
│
├── core/                          # Foundation Engine
│   ├── context.ts                 # AsyncLocalStorage tenant & user context
│   ├── crypto.ts                  # RFC 9562 UUIDv7 generator, scrypt hashing, auth tokens
│   ├── events.ts                  # In-process EventEmitter event bus
│   ├── storage.ts                 # Path-safe local file storage abstraction
│   ├── module-loader.ts           # Dynamic module scanner & registrar
│   └── index.ts
│
├── api/                           # Zero-Dependency HTTP Layer
│   ├── router.ts                  # Native HTTP router (regex matching, body parser)
│   ├── middleware.ts              # Tenant resolution, auth verification, rate limiting
│   ├── response.ts                # Standardized JSON response envelopes
│   ├── server.ts                  # Native HTTP server harness & health checks
│   └── index.ts
│
├── database/                      # SQLite Database Layer
│   ├── client.ts                  # node:sqlite client with WAL mode & transactions
│   ├── migrator.ts                # Native SQL migration runner & _migrations tracker
│   ├── seed.ts                    # Realistic 20-unit sample portfolio seeder
│   └── migrations/                # Core system migrations
│       └── 0001_core_schema.sql
│
├── modules/                       # Self-Contained Domain Modules
│   ├── properties/                # Portfolios, Properties, Units & test/
│   ├── contacts/                  # Human & Organization Directory & test/
│   ├── leases/                    # Lease Contracts, Signatories & test/
│   ├── accounting/                # Ledger, Billing, Schedule E & test/
│   └── maintenance/               # Work Orders, Dispatch & test/
│
├── web/                           # Native PHP Presentation Layer
│   ├── index.php                  # Front controller, CSRF validator & dynamic router
│   ├── lib/                       # API client, session auth, CSRF, and UI hooks
│   ├── templates/                 # Base layout, header, dynamic sidebar, flash alerts
│   ├── pages/                     # Dashboard and login view controllers
│   └── public/                    # Design tokens, CSS styles, and minimal JavaScript
│
└── test/                          # Core System node:test & node:assert Suite
    ├── helpers.ts                 # In-memory SQLite fixtures & mock harnesses
    ├── crypto.test.ts             # UUIDv7 format, timestamp ordering & scrypt tests
    ├── context.test.ts            # AsyncLocalStorage concurrency & isolation tests
    ├── isolation.test.ts          # Cross-tenant data isolation & leak tests
    ├── router.test.ts             # Route matching, params & body parsing tests
    └── modules.test.ts            # Dynamic module & test packaging discovery tests
```

---

## Getting Started

### 1. Prerequisites

Ensure you have the following installed on your system:

* **Node.js**: `v22.5.0` or higher (`node -v`)
* **PHP**: `8.2` or higher (`php -v`) with `curl`, `session`, `filter`, and `pdo_sqlite` extensions enabled

---

### 2. Automated One-Line Installation

> [!NOTE]
> The automated installation scripts below are provided for developer evaluation, testing, and preview environments. As noted in the [Pre-Production Disclaimer](#pre-production-disclaimer), end users should not install this software for production property operations until an official stable release is issued.

Install directly from GitHub Releases with a single terminal command:

#### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/garrisonos/GarrisonOS/main/scripts/install.ps1 | iex
```

**Linux / macOS**:

```bash
curl -fsSL https://raw.githubusercontent.com/garrisonos/GarrisonOS/main/scripts/install.sh | bash
```

---

### 3. Developer & Manual Setup

For manual repository setup or development:

1. **Clone the repository**:

   ```bash
   git clone https://github.com/garrisonos/GarrisonOS.git
   cd GarrisonOS
   ```

2. **Run the automated preflight and setup tool**:

   ```bash
   npm run setup
   # or with realistic 20-unit demo portfolio seeded:
   npm run setup -- --seed
   ```

   *(This tool automatically validates prerequisites, generates `.env` with a secure random `APP_SECRET`, compiles TypeScript, and executes SQLite migrations).*

---

### 4. Running the Application

Start both the backend API engine and frontend web presentation layer with a single command:

```bash
# Start full application (Default Web UI: http://localhost:8080)
npm start

# Or customize local ports on the fly:
npm start -- --port=8080 --api-port=3000

# For auto-reloading development mode:
npm run dev
```

Once running, open your web browser at **`http://localhost:8080`**.

#### Demo Credentials

* **Email**: `operator@garrisonos.local`
* **Password**: `Password123!`
* **Tenant ID**: `tenant-demo`

---

## Automated Test Suite

GarrisonOS includes comprehensive automated unit, integration, and security isolation tests powered by Node.js built-in test runner (`node:test` and `node:assert`):

```bash
# Run full automated test suite (executes core and all module-packaged tests)
npm test
```

The test suite validates:

* **Core Subsystems** (`test/`):
  * **Cryptography & Identity**: RFC 9562 UUIDv7 structure, monotonic timestamp sorting, `scrypt` password hashing, and HMAC session token verification.
  * **Multi-Tenant Context**: `AsyncLocalStorage` propagation across concurrent asynchronous operations and strict rejection outside context.
  * **Row-Level Tenant Isolation**: Verification that Tenant A cannot query or mutate records belonging to Tenant B across all domain entities.
  * **HTTP Router**: Route parameter extraction, query string parsing, body streaming, and structured error responses.
  * **Module Loader & Test Enforcement**: Dynamic discovery of manifests, migrations, routes, subscribers, and verification that all modules package their own test suites.
* **Module-Packaged Domain Logic** (`modules/[module_name]/test/`):
  * **Accounting**: Running tenant balances, 4-tier waterfall payment allocation, deposit trust dispositions, Schedule E NOI calculations, monthly rent generation idempotency, and mid-month proration.
  * **Properties**: Portfolios, properties, units, vacancy state transitions, and occupancy metrics.
  * **Contacts**: Human directory filtering, vendor specializations, and soft-delete lifecycle.
  * **Leases**: Contract lifecycle transitions, multi-party signatories, and financial terms.
  * **Maintenance**: Work order priority triage, vendor assignments, and cross-module expense event triggers.

---

## Documentation

Full architectural specifications, module details, API contracts, development guides, and deployment instructions are available in the [`docs/`](docs/README.md) directory:

* **Architecture**:
  * [System Architecture Overview](docs/architecture/overview.md)
  * [Strict Multi-Tenancy & Isolation](docs/architecture/multi-tenancy.md)
  * [Data Representation & Identity Standards](docs/architecture/data-model.md)
  * [Architecture Specification & Blueprint](docs/architecture/bootstrap-spec.md)
  * [Technical Debt Assessment & Critique](docs/architecture/technical-debt.md)
* **Domain Modules**:
  * [Module System Architecture](docs/modules/overview.md)
  * [Properties & Portfolios](docs/modules/properties.md)
  * [Contacts Directory](docs/modules/contacts.md)
  * [Lease Management](docs/modules/leases.md)
  * [Accounting & IRS Schedule E](docs/modules/accounting.md)
  * [Maintenance Work Orders](docs/modules/maintenance.md)
* **API & Events**:
  * [REST API Reference](docs/api/rest-api.md)
  * [In-Process EventBus Reference](docs/api/events.md)
* **Development & QA**:
  * [Developer Getting Started](docs/development/getting-started.md)
  * [Frontend Presentation Layer Guide](docs/development/frontend-guide.md)
  * [Testing & QA Guide](docs/development/testing.md)
* **Deployment & Operations**:
  * [Production Self-Hosting Guide](docs/deployment/self-hosting.md)
  * [Configuration Reference](docs/deployment/configuration.md)
  * [SQLite WAL Backup & Maintenance](docs/deployment/backup-and-maintenance.md)

---

## Contributing

We welcome contributions from the community! Please review our [Contributing Guide](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), and [Contributor License Agreement (CLA)](docs/legal/CLA.md) before submitting Pull Requests.

All contributions must adhere to the engineering standards specified in [AGENTS.md](AGENTS.md).

---

## License

GarrisonOS is licensed under the [GNU Affero General Public License v3 (AGPLv3)](LICENSE) with a Section 7(b) attribution addendum. Dual-licensing and commercial licensing options are available for organizations requiring proprietary embedding.
