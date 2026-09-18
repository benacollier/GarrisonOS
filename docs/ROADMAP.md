# GarrisonOS Canonical Development Roadmap

This document outlines the canonical development roadmap to Foundational MVP General Availability (**v0.1.0 GA**, achieved at the completion of **Sprint 5**) and subsequent major releases for **GarrisonOS**. It synthesizes architectural requirements, sprint milestones, clean-room domain specifications, and continuous progress metrics grounded in the [Comprehensive Project Review](LLMREVIEW20260915.md), [Domain Models Specification](architecture/domain-models.md), and [API Specification](architecture/api-spec.md).

---

## 1. Executive Progress & Project Health Scorecard

Continuous evaluations track implementation maturity against the non-negotiable engineering guardrails established in [`AGENTS.md`](../AGENTS.md).

### Overall Project Health Progression

| Metric Category | Baseline (2026-09-15) | Post-Sprint 1 (2026-09-17) | Post-Sprint 2 (2026-09-17) | Current (In Sprint 3) | Target (v0.1.0 GA - Sprint 5) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Architecture & Design** | 92% | 96% | 98% | **99%** | 100% |
| **Core Implementation** | 85% | 92% | 96% | **96%** | 100% |
| **Module Completeness** | 65% | 84% | 92% | **94%** | 100% (Foundational MVP) |
| **Testing & Verification** | 75% | 85% | 96% | **96%** | 100% (Full regression) |
| **Documentation & Hygiene** | 80% | 90% | 95% | **98%** | 100% (Synchronized) |
| **Security & Isolation** | 78% | 88% | 94% | **96%** | 100% (Audited) |
| **Production Readiness** | 50% | 65% | 92% | **94%** | 100% (Packaged Installers) |
| **Composite Project Score** | **78% (B+)** | **86% (B+)** | **95% (A)** | **96% (A)** | **100% (A+) General Availability** |

---

### MVP Phase Completion Tracking

Progress across the seven canonical architectural phases leading to Foundational MVP:

| Phase | Description | Baseline | Current | Grade | Status | MVP Target Milestone |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **1** | Core Engine, Multi-Operator & Admin GUI | 85% | **95%** | A | Mostly Complete | Admin Management GUI & Configurable RBAC (Sprint 3) |
| **2** | Base Entity, Inventory & Attachments | 70% | **95%** | A | Mostly Complete | Pre-MVP Universal Document Attachments & Safety (Sprint 3) |
| **3** | Core Property Operations & Conversations | 65% | **95%** | A | Mostly Complete | Universal Entity Conversations & Preventative Scheduling (Sprint 4) |
| **4** | Financial Ledger, Client Accounting & AP | 88% | **98%** | A+ | Exceptional | Client Accounting (Sprint 4), AP & PDF Checks (Sprint 5) |
| **5** | Native Presentation & Public Tenant Portal | 60% | **92%** | A- | Strong | Public Tenant Portal on Subdomain `portal.<domain>` (Sprint 5) |
| **6** | Data Portability, Resilience & Media Backup | 100% | **100%** | A+ | Complete | Packaging physical attachment media in backup archives (Sprint 3) |
| **7** | MVP Verification, Packaging & GUI Installers| 55% | **90%** | A- | Near Complete | Turnkey Click-Through GUI Installers (Windows/macOS/Linux) (Sprint 5) |

---

### Module Health Scorecard

| Module | Current | Grade | Key Capabilities Delivered & Near-Term MVP Scope |
| :--- | :---: | :---: | :--- |
| **Accounting** | **98%** | A+ | Append-only double-entry ledger, statutory trust fund segregation (`1010` vs `1020`), Three-Way Bank Reconciliation, Form 1099-NEC aggregation, Schedule E mapping. *In MVP*: Client Portfolio Accounting (Sprint 4), Accounts Payable (AP), Zero-Dependency PDF Check Printing, and Bank Deposit Batching (Sprint 5). |
| **Backup** | **98%** | A+ | In-process `BackupScheduler` daemon, hot vacuuming, automated retention pruning, snapshot export/import with SHA-256 integrity checks. *In MVP*: Bundling physical media attachments into verified backup archives (Sprint 3). |
| **Contacts** | **90%** | A- | Multi-role directory, trade specializations, visual W-9 verification flags (`w9_received`), legal tax classifications, 1099-NEC audit links. |
| **Maintenance** | **90%** | A- | Work order lifecycle, priority triage (`emergency` $\to$ `low`), trade-filtered vendor dispatch modal, automated make-ready orders (`make_ready`). |
| **Leases** | **90%** | A- | Multi-party signatories (`primary_tenant`, `guarantor`), lease renewal modal, move-out termination notice workflow, statutory deposit countdowns. *In MVP*: Itemized recurring charges, late fee policies, credits/concessions, and tenant deposit refunds (Sprint 4). |
| **Properties** | **90%** | A- | Portfolios, properties, unit inventories, vacancy metrics, unit turnover state machine (`vacant` $\leftrightarrow$ `turnover` $\leftrightarrow$ `maintenance_hold`). *In MVP*: Dynamic custom fields support (Sprint 5). |

---

### MVP Critical Path & Success Criteria

- [x] **Sprint 1 (Weeks 1–2): Core Foundation & Architecture Hardening** (Completed 2026-09-17)
  - [x] EventBus `AsyncLocalStorage` context loss resolved (`RequestContext.run()`).
  - [x] Database migration topological dependency sorting implemented.
  - [x] Stateless token vulnerability resolved (`token_version` tracking and validation).
  - [x] CORS origin restriction & fail-closed `APP_SECRET` verification.
  - [x] Statutory trust fund segregation (`1010` vs `1020`) & Three-Way Bank Reconciliation schedules.
  - [x] In-process `BackupScheduler` daemon with automated WAL checkpoints & vacuuming.
  - [x] 100% Pure TypeScript SSR rebase eliminating legacy PHP runtime.
- [x] **Sprint 2 (Weeks 3–4): Production Readiness & Interactive Workflows** (Completed 2026-09-17)
  - [x] Multi-step user journey E2E lifecycle test suite (`test/e2e/lifecycle.test.ts`).
  - [x] Hardened Systemd service unit (`deploy/systemd/garrison.service`) and zero-dependency Dockerfile (`node:24-alpine`).
  - [x] Unit turnover state machine (`vacant` $\leftrightarrow$ `turnover` $\leftrightarrow$ `maintenance_hold`) & make-ready automation.
  - [x] Lease renewal and move-out termination workflows with statutory deposit disposition timers.
  - [x] Vendor trade specialization badges & W-9 tax compliance indicators.
  - [x] Router static route precedence matching in `api/router.ts`.
- [ ] **Sprint 3 (Weeks 5–6): System Governance, Universal Attachments & Backup Integration** (In Progress, Target: v0.1.0-alpha)
  - [ ] Operator lifecycle administration API (`POST /api/v1/system/operators`) & storage quota management.
  - [ ] Global sliding-window rate limiting across all operational route handlers.
  - [ ] Admin Management GUI Subsystem (error reporting, operator telemetry, dynamic module management).
  - [ ] Highly Configurable Role-Based Access Control (RBAC) permission matrix (`resource:action`).
  - [ ] Universal Attachments Subsystem pre-MVP with strict document and media safety hygiene (PDF script stripping, EXIF stripping).
  - [ ] Extending `modules/backup` to package physical attachment files alongside SQLite database snapshots.
  - [ ] Formal pre-release security review & automated GitHub Actions release pipeline.
- [ ] **Sprint 4 (Weeks 7–8): Financial Modernization, Client Accounting & Policy Engine** (Planned, Target: v0.1.0-beta)
  - [ ] Deprecation and removal of legacy single-entry accounting (`transactions` table) and abandoned aliases (`tenants` view).
  - [ ] Client Accounting & Management Fees (fiduciary portfolio accounting, capital contributions, client distributions, automated management fee rules).
  - [ ] Leasing AR & Fee Policy Engine (recurring lease charges, late fee policy engine, credit memos/concessions, deposit refunds).
  - [ ] Universal Conversations & Notes Subsystem across all primary operational entities.
  - [ ] Zero-dependency notification dispatcher (SMTP / webhook) & preventative maintenance scheduling.
- [ ] **Sprint 5 (Weeks 9–10): Foundational General Availability MVP Release** (Planned, Target: v0.1.0 GA)
  - [ ] **Packaged GUI Installers**: Super-simple click-through graphical setup wizards for Windows (`.exe`/`.msi`), macOS (`.pkg`/`.dmg`), and Linux (`.deb`).
  - [ ] **Public-Facing Tenant Self-Service Portal**: Hosted on isolated subdomain (`portal.<domain>`) with magic-link passwordless email login, mobile-first presentation, and safe mobile maintenance photo uploads.
  - [ ] **Accounts Payable (AP) Core Subsystem**: Bill lifecycle (Draft, Unapproved, Approved, Paid, Voided), multi-property bill allocations, and recurring bills.
  - [ ] **Zero-Dependency PDF Vendor Check Printing**: Native vector stream check generator (`web/lib/pdf.ts`) supporting ANSI X9.100-140 check stock specifications.
  - [ ] **Bank Deposits & Batched Clearing**: Grouping receipts into deposit batches matching physical bank statements.
  - [ ] **Dynamic Custom Fields Engine**: Validated JSON custom fields across primary entities.

---

## 2. Canonical Architectural Phases

### Phase 1: Core Engine, Multi-Operator & Admin Governance `[95% - Mostly Complete]`
* [x] Hardening zero-dependency Node.js HTTP/SQLite engine (`node:http`, `node:sqlite`, `node:crypto`).
* [x] Context propagation and operator isolation (`AsyncLocalStorage`, `X-Operator-ID`).
* [x] Unified auth, session management, and revocable token versioning (`token_version`).
* [x] In-process `EventBus` pub/sub backbone with context persistence.
* [x] Static-first route specificity matching eliminating wildcard collisions.
* [ ] Operator lifecycle provisioning API (`POST /api/v1/system/operators`) & storage quota governance *(Sprint 3)*.
* [ ] Admin Management GUI (error logs, health telemetry, dynamic module status) *(Sprint 3)*.
* [ ] Highly Configurable Role-Based Access Control (RBAC) permission matrix *(Sprint 3)*.

---

### Phase 2: Base Entity, Inventory & Universal Attachments `[95% - Mostly Complete]`
* [x] Portfolios, properties, and rentable unit inventories with turnover status tracking.
* [x] Multi-role directory management (tenants, clients, vendors, emergency contacts).
* [x] Vendor compliance tracking (trade specializations, tax classifications, W-9 verification).
* [ ] Pre-MVP Universal Document Attachments Subsystem across leases, properties, and work orders *(Sprint 3)*.
* [ ] Document & Media Safety Hygiene: Automatic EXIF stripping, bounded downsampling, and PDF script sanitization *(Sprint 3)*.

---

### Phase 3: Core Property Operations & Communications `[95% - Mostly Complete]`
* [x] Leasing lifecycle: draft, active, renewal, and move-out termination workflows.
* [x] Maintenance & work orders: priority triage, trade-filtered vendor dispatch, make-ready automation.
* [x] Cross-module operational event publishing (`lease.created`, `work_order.completed`).
* [ ] Universal Conversations & Threaded Notes across all operational entities *(Sprint 4)*.
* [ ] Preventative recurring maintenance scheduling engine *(Sprint 4)*.

---

### Phase 4: Financial Ledger, Client Accounting & Accounts Payable `[98% - Exceptional]`
* [x] Immutable, append-only double-entry general ledger with strict integer-cents tracking (`journal_entries` and `journal_lines`).
* [x] Statutory trust accounting fund segregation (`1010 Operating Checking` vs. `1020 Trust Checking` and `2100 Tenant Security Deposits Held Liability`).
* [x] Automated Three-Way Bank Reconciliation verification schedules.
* [x] Standardized Chart of Accounts (IRS Schedule E lines and QuickBooks compatibility mapping).
* [x] Vendor tax compliance (Tax ID tracking, W-9 verification, Form 1099-NEC aggregation).
* [ ] Sunset and removal of legacy single-entry `transactions` table and `tenants` view *(Sprint 4)*.
* [ ] Client Portfolio Accounting & Management Fee Agreements (capital contributions, net cash draws, automated fee calculations) *(Sprint 4)*.
* [ ] Leasing AR & Fee Policy Engine (recurring auto-charges, late fee policy rules, concessions, deposit refunds) *(Sprint 4)*.
* [ ] Accounts Payable (AP) & Vendor Invoicing Subsystem (bills, multi-unit allocations, recurring bills) *(Sprint 5)*.
* [ ] Zero-Dependency Server-Rendered PDF Vendor Check Printing (ANSI check stock specs) *(Sprint 5)*.
* [ ] Bank Deposits & Batched Clearing for 3-way reconciliation *(Sprint 5)*.

---

### Phase 5: Native Presentation Layer & Public Tenant Portal `[92% - Strong]`
* [x] Native TypeScript SSR presentation architecture (`web/lib/html.ts`, `node:http`), layout shells, and CSS custom properties design system.
* [x] Complete removal of legacy PHP presentation code (39 files, 4,318 LOC eliminated).
* [x] Operator dashboards, search, and CRUD views for properties, contacts, leases, and work orders.
* [x] Interactive operator workflow modals (unit turnover, lease renewal, termination notices, vendor dispatch).
* [x] Financial reporting interfaces (income statements, rent roll, ledger balance views, 3-way reconciliation schedules).
* [ ] Public-Facing Tenant Self-Service Portal on isolated subdomain (`portal.<domain>`) with magic-link email login *(Sprint 5)*.
* [ ] Mobile-first responsive presentation for tenant balance checks and safe photo maintenance requests *(Sprint 5)*.

---

### Phase 6: Data Portability, Resilience & Media Backup `[100% - Complete]`
* [x] Point-in-time database snapshotting and WAL checkpoint management.
* [x] Operator data export/import workflows with SHA-256 verification.
* [x] In-process `BackupScheduler` daemon with automated schedules, vacuuming, and retention pruning.
* [x] Automated disaster recovery verification tests and restore CLI (`scripts/restore.js`).
* [ ] Extending backup archives to package physical attachment media alongside SQLite database snapshots *(Sprint 3)*.

---

### Phase 7: MVP Verification, Packaging & GUI Installers `[90% - Near Complete]`
* [x] End-to-end integration test suite (`test/e2e/lifecycle.test.ts`) validating full operator journey.
* [x] Hardened Systemd service unit (`deploy/systemd/garrison.service`) with Linux sandboxing.
* [x] Multi-stage zero-dependency Dockerfile (`node:24-alpine`) and `docker-compose.yml`.
* [x] Automated TLS reverse proxy configurations (Caddy / Nginx).
* [x] Comprehensive production deployment runbook (`docs/deployment/production-guide.md`).
* [ ] Packaged GUI Installers (turnkey click-through setup wizards for Windows, macOS, Linux) *(Sprint 5)*.
* [ ] Pre-release penetration audit and security review *(Sprint 3)*.
* [ ] Automated GitHub Actions release pipeline with cryptographic `SHA256SUMS` *(Sprint 3)*.

---

## 3. Canonical Sprint Execution Roadmap

GarrisonOS organizes engineering work into structured two-week execution sprints:

### Sprint 1 (Weeks 1–2): Core Foundation & Architecture Hardening
> **Status**: Completed (2026-09-17) | **Release Target**: v0.1.0-alpha.1 | **Effort**: 32 hours

| Work Stream | Key Deliverables | Status |
| :--- | :--- | :---: |
| **Critical Defect Remediation** | Resolved all P0 issues: EventBus context propagation, topological migration ordering, and stateless token revocation (`token_version`). | ✅ Completed |
| **Security & Network Hardening** | Restricted CORS to configured origin whitelist; enforced fail-closed `APP_SECRET` verification; added `/api/v1/batch` hydration endpoint. | ✅ Completed |
| **Statutory Trust Accounting** | Implemented fiduciary trust segregation (`1010` vs `1020`), Three-Way Bank Reconciliation schedules, IRS Form 1099-NEC vendor aggregation, and statutory move-out disposition timelines. | ✅ Completed |
| **Automated Backup Daemon** | Built in-process `BackupScheduler` daemon with automated WAL checkpoints, SQLite snapshots, vacuum/optimize routines, retention pruning, and dashboard controls. | ✅ Completed |
| **Pure TypeScript Rebase** | Eliminated 39 legacy PHP files (4,318 LOC); established 100% pure TypeScript SSR presentation layer (`web/lib/html.ts`, session manager, CSRF guard, hook registry). | ✅ Completed |
| **Compliance & Tooling** | Created zero-dependency hygiene scanner (`scripts/check-hygiene.js`), security blast radius checker (`scripts/check-security.js`), and low-token test runner (27 test suites passing). | ✅ Completed |

---

### Sprint 2 (Weeks 3–4): Production Readiness, Operator Workflows & Release Candidate
> **Status**: Completed (2026-09-17) | **Release Target**: v0.1.0-alpha.2 | **Effort**: 42 hours

| Work Stream | Key Deliverables | Status |
| :--- | :--- | :---: |
| **Turnkey Production Packaging** | Provided hardened Systemd service unit (`deploy/systemd/garrison.service`) and multi-stage, zero-dependency Dockerfile (`node:24-alpine`) with turnkey `docker-compose.yml`, reverse proxy configs (Caddy / Nginx), and deployment guide. | ✅ Completed |
| **Interactive Operator Workflows** | Wired interactive modals and state machines in TypeScript SSR: vacant-unit turnover (`vacant` $\leftrightarrow$ `turnover` $\leftrightarrow$ `maintenance_hold`), lease renewals/terminations, and maintenance vendor dispatch. | ✅ Completed |
| **Vendor Tax & Specialization UI** | Exposed vendor trade specialization badges (Plumbing, HVAC, etc.) and visual W-9 verification flags in contacts directory and detail views with schema migration (`0002_add_vendor_w9.sql`). | ✅ Completed |
| **Router Trie / Static Precedence** | Refactored `api/router.ts` dispatch matching to guarantee literal static segments take precedence over parameterized wildcard segments, preventing route registration collisions. | ✅ Completed |
| **Token Security Hardening** | Enforced mandatory numeric `token_version` check in `verifyTokenWithDatabase()`, rejecting legacy unversioned tokens to guarantee 100% session revocability. | ✅ Completed |
| **End-to-End (E2E) Test Suite** | Implemented comprehensive multi-step user-journey test suite (`test/e2e/lifecycle.test.ts`) validating portfolio setup, leasing, trust deposits, rent runs, maintenance dispatch, move-out turnover, and ledger parity. | ✅ Completed |

---

### Sprint 3 (Weeks 5–6): Operator Administration, Universal Attachments & Backup Integration
> **Status**: In Progress / Planned | **Release Target**: v0.1.0-alpha | **Effort**: ~44 hours

| Priority | Task | Effort | Impact | Status |
| :---: | :--- | :---: | :---: | :---: |
| 14 | Operator lifecycle administration API (`POST /api/v1/system/operators` with legacy alias) & storage quota governance | 8h | High | Planned |
| 15 | Global sliding-window rate limiting across all operational routes | 6h | High | Planned |
| 16 | **Admin Management GUI Subsystem**: server-rendered administration dashboard providing: (a) system error reporting and failed task logs, (b) general operator health/quota telemetry, and (c) dynamic module management (inspect manifests, toggle module status) | 10h | High | Planned |
| 17 | **Highly Configurable Role-Based Access Control (RBAC)**: fine-grained permission matrix (`resource:action`), role definitions, and route authorization guards replacing static enum checks | 6h | High | Planned |
| 18 | **Universal Attachments Subsystem & Document Safety**: pre-MVP document management component across leases, properties, contacts, and work orders; strict safety hygiene (PDF structure validation, stripping embedded executable scripts, MIME whitelisting, directory traversal defense) | 8h | High | Planned |
| 19 | **Media & Attachment Backup Engine Integration**: extend `modules/backup` (`BackupScheduler`, export/import CLI) to package physical file attachments alongside the SQLite database into verified archives with SHA-256 integrity checks | 6h | High | Planned |

---

### Sprint 4 (Weeks 7–8): Financial Modernization, Client Accounting & Policy Engine
> **Status**: Planned | **Release Target**: v0.1.0-beta | **Effort**: ~44 hours

| Priority | Task | Effort | Impact | Status |
| :---: | :--- | :---: | :---: | :---: |
| 20 | **Deprecation & Removal of Legacy Single-Entry Accounting & Abandoned Aliases**: sunset legacy `transactions` table, refactor all ledger and QuickBooks queries directly to `journal_entries`/`journal_lines`, remove legacy `tenants` compatibility view, and prune stale route aliases | 8h | High | Planned |
| 21 | **Client Accounting & Management Fees**: portfolio and property-level fiduciary accounting, Client Capital Contributions, automated management fee calculation (% of rent / flat unit fee), and Client Distribution / Draw engine based on net operating cash | 10h | High | Planned |
| 22 | **Leasing AR & Fee Policy Engine**: itemized `recurring_lease_charges` (recurring pet rent, parking, utilities), configurable `late_fee_policies` (due day, grace period, flat/pct), credit memos/discounts, and tenant refunds | 10h | High | Planned |
| 23 | **Universal Conversations & Notes Subsystem**: polymorphic threaded notes and audit comments on leases, contacts, work orders, and properties | 6h | Medium | Planned |
| 24 | Zero-dependency notification dispatcher (SMTP / webhook) & preventative maintenance scheduling engine (HVAC, alarms, winterization) | 6h | High | Planned |
| 25 | Periodic balance snapshotting & checkpointing for high-volume tenancies | 4h | Medium | Planned |

---

### Sprint 5 (Weeks 9–10): Foundational General Availability MVP (v0.1.0 GA)
> **Status**: Planned | **Release Target**: v0.1.0 (Foundational MVP GA) | **Effort**: ~56 hours

| Priority | Task | Effort | Impact | Status |
| :---: | :--- | :---: | :---: | :---: |
| 26 | **Packaged GUI Installers (Turnkey Click-Through Setup Wizards)**: graphical installer packaging (Windows `.exe`/`.msi` via NSIS/InnoSetup, macOS `.pkg`/`.dmg`, Linux `.deb`) that bundles or detects verified Node.js runtimes, provisions system services/launch daemons, configures data paths, and launches the initial browser handshake | 8h | High | Planned |
| 27 | **Public-Facing Tenant Self-Service Portal (Subdomain Architecture)**: `portal.<domain>` isolated subdomain routing, magic-link passwordless email authentication, mobile-first responsive presentation, and public security hardening (rate limiting, anti-brute force, zero session leakage) | 12h | High | Planned |
| 28 | **Safe Mobile Photo Upload Pipeline**: tenant maintenance submission with automated EXIF metadata stripping (PII/GPS sanitization), bounded stream downsampling to compact safe WebP/JPEG, and anti-polyglot file verification | 6h | High | Planned |
| 29 | **Accounts Payable (AP) Core Subsystem**: integrated into `modules/accounting/` (`backend/bills.ts`, `bills_repository.ts`), managing bill lifecycle (Draft, Unapproved, Approved, Paid, Voided), payment terms, due dates, and work order expense recovery | 10h | High | Planned |
| 30 | **Multi-Entity Bill Allocations & Recurring Bills**: allocate bills across portfolios, properties, units, and GL expense accounts; interval-scheduled recurring bills for utilities and service contracts | 6h | High | Planned |
| 31 | **Zero-Dependency PDF Vendor Check Printing**: native server-rendered PDF check generator (`web/lib/pdf.ts`) supporting user-provided check template specifications (voucher/standard/MICR positioning) with strict PDF structural hygiene | 6h | High | Planned |
| 32 | **Bank Deposits & Batched Clearing**: grouping multiple cash/check/electronic receipts into deposit slip batches for 3-way reconciliation | 4h | High | Planned |
| 33 | **Dynamic Custom Fields Engine**: validated JSON column (`custom_fields`) on primary entities governed by `custom_field_definitions` schema table | 4h | Medium | Planned |

---

### Sprint 6 (Weeks 11–12): Dual-Engine Architecture & Native PostgreSQL Integration
> **Status**: Planned | **Release Target**: v0.2.0 | **Effort**: ~44 hours

| Priority | Task | Effort | Impact | Status |
| :---: | :--- | :---: | :---: | :---: |
| 34 | Native PostgreSQL driver adapter implementing zero-dependency boundary | 16h | High | Planned |
| 35 | Dual-engine migration validation harness (SQLite & PostgreSQL) | 10h | High | Planned |
| 36 | Multi-instance clustering support behind load balancers with connection pooling | 10h | Medium | Planned |
| 37 | S3-compatible shared object storage driver for multi-node deployments | 8h | Medium | Planned |

---

### Sprint 7 (Weeks 13–14): Commercial Real Estate (CRE) & Integrated Banking Rails
> **Status**: Planned | **Release Target**: v0.3.0 | **Effort**: ~40 hours

| Priority | Task | Effort | Impact | Status |
| :---: | :--- | :---: | :---: | :---: |
| 38 | Triple Net (NNN) leases & Common Area Maintenance (CAM) reconciliation engine | 14h | High | Planned |
| 39 | CPI-indexed and fixed-percentage annual lease escalation schedules | 8h | Medium | Planned |
| 40 | Direct OFX/QBO bank statement import parser & reconciliation matching | 12h | High | Planned |
| 41 | Payment processor webhook ingestion & settlement journal entries | 6h | Medium | Planned |

---

## 4. Post-MVP Architectural Horizons

The following domains are cataloged in Post-MVP Architectural Horizons, with clean-room forward-compatibility covenants preserved in earlier database schemas:

1. **SMS Dispatch & Mobile Messaging Rails**:
   - Outbound messaging rails for tenant magic links, maintenance alerts, and rent reminders via zero-dependency webhook dispatcher.
   - *Forward compatibility*: Notification dispatcher designed with transport adapter pattern (`email`, `sms`, `webhook`).
2. **Client Self-Service Portal**:
   - Subdomain portal (`client.<domain>`) for property owners/investors to view portfolio net cash, download distribution statements, and approve repair expenses above threshold limits.
   - *Forward compatibility*: RBAC engine and session manager admit `client` role credentials natively.
3. **Property Condition Inspections Subsystem**:
   - Clean-room inspection hierarchy: `inspections` $\to$ `inspection_zones` $\to$ `inspection_elements` with standard condition grading (`clean`, `good`, `fair`, `poor`, `damaged`) and photo evidence.
   - *Forward compatibility*: Core `attachments` table provides photo storage; turnover state machine (`turnover` $\to$ `make_ready`) is wired with EventBus hooks for future `inspection.completed` events.
4. **Prospects & Lead-to-Lease Pipeline**:
   - Inquiring applicant intake, showing logs, desired unit/budget/pet specs, marketing campaign source tracking, and one-click conversion to lease.
   - *Forward compatibility*: `contacts` table supports `contact_type = 'prospect'`; `leases` schema reserves nullable `prospect_id` origin link.
5. **Work Order Task Checklists & Technician Time Cards**:
   - Maintenance task checklists (`work_order_tasks`) and labor hour tracking (`technician_timecards`).
   - *Forward compatibility*: `work_orders` UUIDv7 primary keys allow 1-to-many task tables without migration rewrites; Sprint 5 AP bills include nullable `work_order_id` for labor invoicing.
6. **High-Throughput Enterprise Batch Ingestion APIs**:
   - Bulk ingestion endpoints (`/api/v1/bulk/*`) for institutional portfolios.
