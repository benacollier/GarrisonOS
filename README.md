# GarrisonOS

> An open-source, modular, zero-dependency, lightweight property management framework designed to liberate property managers from closed vendor lock-in, inflexible data schemas, and proprietary software silos.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Pre--Production%20Prototype-yellow.svg)](#pre-production-disclaimer)
[![Node.js](https://img.shields.io/badge/Node.js-v22.5%2B-green.svg)](https://nodejs.org/)
[![PHP](https://img.shields.io/badge/PHP-8.2%2B-purple.svg)](https://www.php.net/)
[![Dependencies](https://img.shields.io/badge/Runtime_Dependencies-0-brightgreen.svg)](#dependencies--runtime-prerequisites)
[![Multi-Tenancy](https://img.shields.io/badge/Multi--Tenancy-Row--Level_Isolation-orange.svg)](#architectural-principles)
[![Documentation](https://img.shields.io/badge/Docs-GitHub_Pages-blue.svg)](https://garrisonos.github.io/GarrisonOS/)

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

## Navigation

| Category | Documents |
| :--------- | :---------- |
| **Roadmap** | [MVP Roadmap](docs/ROADMAP.md) |
| **Architecture** | [Overview](docs/architecture/overview.md) • [Multi-Tenancy](docs/architecture/multi-tenancy.md) • [Data Model](docs/architecture/data-model.md) • [Bootstrap Spec](docs/architecture/bootstrap-spec.md) • [Technical Debt](docs/architecture/technical-debt.md) |
| **Domain Modules** | [Overview](docs/modules/overview.md) • [Properties](docs/modules/properties.md) • [Contacts](docs/modules/contacts.md) • [Leases](docs/modules/leases.md) • [Accounting](docs/modules/accounting.md) • [Maintenance](docs/modules/maintenance.md) • [Backup](docs/modules/backup.md) |
| **API** | [REST API](docs/api/rest-api.md) • [EventBus](docs/api/events.md) |
| **Development** | [Getting Started](docs/development/getting-started.md) • [Frontend Guide](docs/development/frontend-guide.md) • [Testing](docs/development/testing.md) • [Tooling](docs/development/tooling.md) |
| **Deployment** | [Self-Hosting](docs/deployment/self-hosting.md) • [Configuration](docs/deployment/configuration.md) • [Backup & Maintenance](docs/deployment/backup-and-maintenance.md) |
| **Legal** | [CLA](docs/legal/CLA.md) • [License](LICENSE) • [Attributions](ATTRIBUTIONS.md) • [Security](SECURITY.md) • [Code of Conduct](CODE_OF_CONDUCT.md) • [Contributing](CONTRIBUTING.md) |

---

## Target MVP Scope

The GarrisonOS MVP is focused strictly on delivering a self-hosted property management suite tailored for **small residential portfolios (up to 50 units)**, including single-family residences, duplexes/triplexes/fourplexes, small multifamily buildings, and scattered sites.

### In Scope for MVP

* **Day-to-Day Operations**: Physical property structures, rentable unit inventories, status lifecycle tracking, human directory management (tenants, owners, vendors, emergency contacts), and maintenance work order dispatching.
* **Lease Agreements**: Residential lease lifecycles, terms, security deposit tracking, and multi-party signatory assignments.
* **Native Double-Entry General Ledger & Statutory Trust Accounting**: Native, immutable double-entry journal engine (`journal_entries` and `journal_lines`) enforcing balanced zero-sum debit/credit invariants, strict statutory trust accounting separation (`1010 Operating Checking` vs. `1020 Security Deposit Trust Checking` and `2100 Tenant Security Deposits Held Liability`) to comply with state non-commingling mandates, automated three-way bank reconciliation proofs (Bank Statement = GL Trust = Tenant Liabilities), Chart of Accounts mapped to IRS Schedule E categories, Trial Balance verification, tenant running balances, automated monthly rent charge generation with mid-month proration, waterfall payment allocation, statutory move-out deposit disposition timelines, annual vendor 1099-NEC expense tracking (> $600 threshold), and streamed exports (Rent Roll, Schedule E P&L, tenant ledgers, QuickBooks QBO/IIF/OFX).
* **Self-Hosting & Privacy**: Single-tenant or multi-tenant deployment, local SQLite database storage operating in WAL mode, and complete data portability.

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
   * **Native Double-Entry General Ledger**: Immutable, append-only bookkeeping engine (`journal_entries` and `journal_lines`) requiring every transaction to satisfy $\sum \text{Debits} \equiv \sum \text{Credits} > 0$. Corrections are posted exclusively via explicit reversal entries.
   * Standard Chart of Accounts mapped to standard IRS Form 1040 Schedule E expense categories for tax preparation, Net Operating Income (NOI) calculation, and QuickBooks integration.
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

![GarrisonOS Executive Dashboard Preview](docs/assets/portal-dashboard.png)

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
* **Physical Properties**: Manage Single-Family Homes, Multifamily Buildings, Condominiums, and Townhouses with address, year built, and metadata.
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

### 4. Native Double-Entry General Ledger & Statutory Trust Accounting (`modules/accounting`)

* **Native Double-Entry Engine**: First-class, immutable double-entry journal entries (`journal_entries`) and lines (`journal_lines`) enforcing strict zero-sum debit/credit balance proofs across all operational transactions.
* **Statutory Trust Accounting & Non-Commingling Invariant**: Enforces fiduciary segregation between operating funds (`1010 Operating Checking`) and tenant security deposits (`1020 Security Deposit Trust Checking` / `2100 Tenant Security Deposits Held Liability`), preventing unlawful commingling under state real estate licensing regulations.
* **Three-Way Bank Reconciliation**: Automated verification schedules proving parity across all three fiduciary dimensions:
  $$\text{Bank Statement Balance} \equiv \text{GL Trust Account Balance (1020)} \equiv \sum \text{Active Lease Deposit Liabilities}$$
* **Statutory Move-Out Disposition & Countdown Timelines**: Jurisdiction-aware statutory deduction deadlines (e.g. CA 21-day, NY 14-day, TX 30-day rules) with itemized statements before security deposit refunds are released.
* **Vendor Tax Compliance (IRS Form 1099-NEC)**: Vendor Tax ID (EIN/SSN) tracking and annual maintenance expense aggregation with automated alerts for vendors meeting or exceeding the statutory $600/year threshold.
* **Trial Balance Reporting**: Live verification report proving $\sum \text{Debits} \equiv \sum \text{Credits}$ across all active accounts with period and property filters.
* **Audit Trail & Reversal Accounting**: Strictly immutable posted entries; voids and adjustments generate explicit contra/reversal entries with linked `reversed_by_entry_id` references.
* **IRS Schedule E Tax Mapping**: Standard Chart of Accounts directly mapped to IRS Form 1040 Schedule E lines (Advertising, Cleaning & Maintenance, Insurance, Legal/Professional, Management Fees, Mortgage Interest, Repairs, Supplies, Property Taxes, Utilities, HOA Fees, Capital Improvements).
* **Running Tenant Balances & Waterfall**: Real-time tenant balance calculation and strict priority waterfall payment allocation:
  $$\text{Late Fees} \longrightarrow \text{Utility Rebill / Fees} \longrightarrow \text{Oldest Rent Charges} \longrightarrow \text{Current Rent}$$
* **Automated Monthly Rent Generation**: Scheduled batch generation with idempotency keys (`rent_charge:{lease_id}:{YYYY_MM}`) posting balanced Dr: Accounts Receivable / Cr: Rental Income entries with mid-month proration.
* **Financial Data & Accounting Exports**: Streamed exports for Rent Roll, Schedule E statements, tenant statements, and direct persistent ledger exports for QuickBooks Online (`.csv`), QuickBooks Desktop (`.iif`), and Web Connect bank feeds (`.qbo`).

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

For a comprehensive phase-by-phase implementation plan, milestone deliverables, and technical task breakdowns, see the [GarrisonOS MVP Roadmap](docs/ROADMAP.md). The progress below is tracked by topic so that implemented prototype code is not confused with completed MVP or production-ready work.

**Progress key:** ✅ Implemented and covered | 🟡 Partial or needs verification | ⬜ Not implemented

|Phase|Topic|Progress|Current position|
|:---|:---|:---:|:---|
|**1. Core Engine & Multi-Tenant Foundation**|Node.js HTTP/SQLite engine and native dependency boundary|✅|Implemented with standard-library runtime, WAL mode, and core test coverage.|
||AsyncLocalStorage context propagation and `X-Tenant-ID` isolation|✅|Implemented across HTTP middleware and EventBus async boundaries; covered by isolation tests.|
||Tenant lifecycle management|⬜|No complete tenant administration or tenant onboarding lifecycle workflow is exposed.|
||Authentication, sessions, tokens, and role-based access|🟡|HMAC tokens, scrypt hashing, spoofing prevention, and backup owner-role gates implemented; rate limiting across all routes remains.|
||EventBus and base repository patterns|✅|EventBus pub/sub with synchronous context inheritance and base repository patterns fully operational.|
|**2. Base Entity & Inventory Management**|Properties, portfolios, units, and inventory routes|🟡|Module repositories, routes, migrations, and tests exist; full UI coverage and vacant-unit turn workflows remain.|
||Multi-role contacts directory|🟡|Unified directory and tests exist; vendor specialization profiles and W-9 tax flags need full integration.|
||Validation, entity relationships, and REST CRUD completeness|🟡|Basic validation and CRUD paths exist; centralized declarative schema validation remains ongoing.|
|**3. Core Property Operations**|Leasing lifecycle & statutory compliance|🟡|Lease routes, state transitions, and atomic deposit disposition exist; statutory notice periods and late-fee caps remain.|
||Maintenance and work-order workflow|🟡|Ticket lifecycle, priority triage, vendor assignment, and test suites exist; dispatch notifications need completion.|
||Cross-module operational events|✅|EventBus context propagation resolved; operational triggers (`lease.created`, `maintenance.completed`) implemented and tested.|
|**4. Financial Ledger & Trust Accounting**|Immutable double-entry journal and integer-cents ledger|✅|Journal/ledger engine (`journal_entries`/`lines`), zero-sum debit/credit proofs, and reversal accounting implemented.|
||Statutory trust accounting & operating fund segregation|✅|Chart of Accounts separates `1010 Operating` and `1020 Trust`; strict non-commingling validation and deposit routing enforced.|
||Three-way bank reconciliation & audit reporting|✅|Automated proof schedule verifying Bank Balance = GL Trust Balance = Active Lease Liabilities.|
||Vendor tax compliance (W-9 & 1099-NEC aggregation)|✅|Vendor Tax ID tracking and annual maintenance expense aggregation with statutory $600 threshold reporting.|
||IRS Schedule E, NOI, and QuickBooks compatibility|✅|Schedule E mapping, Rent Roll, QBO/IIF/OFX exports, and year-end 1099-NEC vendor aggregation implemented and tested.|
|**5. Native Presentation Layer & User Experience**|Native PHP shell, layouts, and CSS system|🟡|Server-rendered shell, design tokens, and light/dark theme operational; deployment integration being hardened.|
||Dashboard and operator views|🟡|Dashboard KPI summary cards and entity CRUD views exist; several reporting sub-tabs remain read-only.|
||Financial reporting views|🟡|Ledger, Rent Roll, and Schedule E views exist; 3-way reconciliation audit view to be added.|
||Form validation, CSRF, and session handling|🟡|CSRF tokens, timing-safe auth verification, and session helpers exist; complete end-to-end security review remains.|
|**6. Data Portability, Resilience & Backup**|SQLite snapshots and WAL checkpointing|✅|Snapshot service, online `VACUUM INTO`, and safe WAL checkpointing implemented and tested.|
||Tenant data export/import and integrity verification|✅|Tenant-scoped `.json.gz` export/import with SHA-256 cryptographic verification implemented and tested.|
||Disaster-recovery restore|✅|CLI restore tooling (`scripts/restore.js`) with header validation, WAL cache cleanup, and migration execution.|
||Scheduled backups, monitoring, and vacuum routines|✅|In-process `BackupScheduler` daemon executing automated snapshots, online vacuum/optimize, and retention pruning.|
|**7. MVP Verification, Hardening & Self-Hosting**|Unit/module tests and tenant-isolation regression coverage|✅|Core and module test suites pass with zero dependencies; deterministic event listeners replace legacy timer sleeps.|
||Security review and production hardening|🟡|Token spoofing prevention and Actions SHA-pinning complete; comprehensive third-party audit planned for Tranche 4.|
||Secure release packaging (Method 2) & checksum verification|✅|Pre-packaged release archives with cryptographic SHA-256 verification implemented across installer tooling.|
||Production daemon supervision & containerization|⬜|Turnkey Docker Compose bundle and Systemd service packaging scheduled for release hardening.|

---

## Future Horizons (Out of Scope for MVP)

To maintain focus, agility, and uncompromising simplicity, commercial-grade and enterprise-scale features are **strictly out of scope for the current MVP**. They are cataloged here for future roadmap consideration:

* **Commercial Real Estate Management**:
  * Triple Net (NNN) lease contracts, Common Area Maintenance (CAM) reconciliations, and expense stop calculations.
  * Retail percentage rent based on tenant sales reporting.
  * CPI-indexed and fixed annual lease escalation schedules.
* **Enterprise Accounting & Finance**:
  * Integrated payment processing gateways (direct ACH debit, credit card rails) and automated live bank feeds (Plaid API sync).
  * Automated 1099-MISC / 1099-NEC bulk electronic filing and direct transmission to the IRS.
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
│       ├── cla.yml                # Automated Contributor License Agreement check
│       └── security.yml           # Automated hygiene and Betterleaks secret scanning
├── .betterleaksignore             # Secret scanning baseline exception rules
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
│   ├── ROADMAP.md                 # Phased MVP development roadmap and milestones
│   ├── architecture/              # Core engine, multi-tenancy, data model & blueprints
│   ├── modules/                   # Properties, contacts, leases, accounting, maintenance, backup
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
│   ├── accounting/                # Ledger, Billing, Schedule E, Chart of Accounts & test/
│   ├── maintenance/               # Work Orders, Dispatch & test/
│   └── backup/                    # SQLite Snapshots, Portability & test/
│
├── web/                           # Native PHP Presentation Layer
│   ├── index.php                  # Front controller, CSRF validator & dynamic router
│   ├── lib/                       # API client, session auth, CSRF, and UI hooks
│   ├── templates/                 # Base layout, header, dynamic sidebar, flash alerts
│   ├── pages/                     # Dashboard, login, and setup wizard view controllers
│   └── public/                    # Design tokens, CSS styles, and minimal JavaScript
│
├── scripts/                       # Zero-Dependency Operational & CI Tooling
│   ├── setup.js                   # Automated preflight environment validator & seeder
│   ├── serve.js                   # Unified Node API & PHP-FPM development runner
│   ├── test.js                    # Dynamic multi-module test runner harness
│   ├── restore.js                 # Disaster recovery & snapshot restore utility
│   └── check-hygiene.js           # Secret scanning & repository hygiene checks
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

### 2. Verified Release Archive Installation (Method 2)

> [!NOTE]
> Pre-packaged release archives and installation scripts are provided for developer evaluation, testing, and preview environments. As noted in the [Pre-Production Disclaimer](#pre-production-disclaimer), end users should not install this software for production property operations until an official stable release is issued.

Download and verify the latest release package with cryptographic SHA-256 validation:

#### Linux / macOS (Bash)

```bash
# Download the release archive and checksum file
curl -LO https://github.com/garrisonos/GarrisonOS/releases/latest/download/garrisonos.tar.gz
curl -LO https://github.com/garrisonos/GarrisonOS/releases/latest/download/SHA256SUMS

# Verify cryptographic SHA-256 integrity
sha256sum -c --ignore-missing SHA256SUMS

# Extract and run setup
mkdir -p garrison-os && tar -xzf garrisonos.tar.gz -C garrison-os --strip-components=1
cd garrison-os && npm run setup
```

#### Windows (PowerShell)

```powershell
# Download the release package and checksum file
Invoke-WebRequest -Uri "https://github.com/garrisonos/GarrisonOS/releases/latest/download/garrisonos.zip" -OutFile "garrisonos.zip"
Invoke-WebRequest -Uri "https://github.com/garrisonos/GarrisonOS/releases/latest/download/SHA256SUMS.txt" -OutFile "SHA256SUMS.txt"

# Verify cryptographic SHA-256 integrity
$expected = (Get-Content SHA256SUMS.txt -Raw).Split()[0].Trim().ToLower()
$actual = (Get-FileHash -Path garrisonos.zip -Algorithm SHA256).Hash.ToLower()
if ($expected -and ($actual -ne $expected)) { throw "Checksum verification failed!" }

# Extract and run setup
Expand-Archive -Path garrisonos.zip -DestinationPath garrison-os -Force
cd garrison-os; npm.cmd run setup
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

   > [!TIP]
   > **Windows PowerShell Users**: If your terminal restricts PowerShell script execution (`PSSecurityException`), run commands using `npm.cmd` or invoke Node directly:
   >
   > ```powershell
   > npm.cmd run setup
   > # or directly via node:
   > node scripts/setup.js --seed
   > ```

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

# On Windows PowerShell (if needed):
npm.cmd start
```

Once running, open your web browser at **`http://localhost:8080`**.

#### First-Launch Onboarding

* On a fresh installation, GarrisonOS automatically opens the **First-Launch Setup Wizard** (`/setup`), allowing you to define your Organization Name and create your Owner Administrator credentials (Email & Password), or restore from an existing backup snapshot.
* If you ran setup with `--seed`, you can immediately sign in using the demo credentials:
  * **Email**: `operator@garrisonos.local`
  * **Password**: `Password123!`
  * **Tenant ID**: `tenant-demo`

---

## Automated Test Suite

GarrisonOS includes comprehensive automated unit, integration, and security isolation tests powered by Node.js built-in test runner (`node:test` and `node:assert`):

```bash
# Run full automated test suite (executes core and all module-packaged tests)
npm test

# On Windows PowerShell (or directly via node):
npm.cmd test
# or: node scripts/test.js
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
  * **Backup**: Point-in-time SQLite snapshot integrity (`VACUUM INTO`), tenant-isolated clean-slate/merge restore, and disaster recovery CLI validations.

---

## Contributing

We welcome contributions from the community! Please review our [Contributing Guide](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), and [Contributor License Agreement (CLA)](docs/legal/CLA.md) before submitting Pull Requests.

All contributions must adhere to the engineering standards specified in [AGENTS.md](AGENTS.md).

---

## Acknowledgements & Attributions

GarrisonOS is built on and inspired by foundational open-source standards, tools, specifications, and regulatory frameworks:

* **Product & Runtime Foundations**: [Node.js](https://nodejs.org/), [PHP](https://www.php.net/), [SQLite](https://www.sqlite.org/), and [RFC 9562 UUIDv7](https://www.rfc-editor.org/rfc/rfc9562.html).
* **Accounting & Domain Standards**: [IRS Form 1040 Schedule E](https://www.irs.gov/forms-pubs/about-schedule-e-form-1040) and QuickBooks interoperability formats.
* **Development Tooling & AI Workers**: [TypeScript](https://www.typescriptlang.org/), [LLM Worker Tools](https://github.com/thevahidal/llm-worker-tools), [NVIDIA NIM](https://build.nvidia.com/), [Ollama](https://ollama.com/), [Qwen 2.5 Coder](https://github.com/QwenLM/Qwen2.5-Coder), [Betterleaks](https://github.com/betterleaks/betterleaks), and [markdownlint](https://github.com/DavidAnson/markdownlint).
* **Governance & Community Standards**: [Conventional Commits](https://www.conventionalcommits.org/), [Apache ICLA](https://www.apache.org/licenses/icla.pdf), [Contributor Covenant](https://www.contributor-covenant.org), and [Mozilla D&I](https://github.com/mozilla/diversity).

For complete third-party notices, license texts, and detailed upstream attributions, see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

---

## License & Governance

GarrisonOS is licensed under the [GNU Affero General Public License v3 (AGPLv3)](LICENSE) with a Section 7(b) attribution addendum.

Pursuant to Section 7(b), any web-facing or interactive deployment of this software must preserve and prominently display original author attribution and branding ("Powered by GarrisonOS" linking to [https://github.com/garrisonos/GarrisonOS](https://github.com/garrisonos/GarrisonOS)) in the primary application footer or navigation interface.

### Non-Profit Stewardship

GarrisonOS is maintained and governed by the GarrisonOS Foundation (501(c)(3) registration pending), a public-benefit organization dedicated to democratizing property management technology, preventing proprietary vendor lock-in, and providing community, workforce, and affordable housing operators with perpetual open-source data sovereignty.
