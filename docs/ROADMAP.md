# GarrisonOS MVP Roadmap

This document outlines the high-level roadmap to MVP for **GarrisonOS**, structured into logically sequenced milestone categories. Subgroups, user stories, and technical tasks will be layered into each phase as development progresses.

---

## Phase 1: Core Engine & Multi-Operator Foundation
>
> *Establishing runtime infrastructure, database primitives, security boundaries, and cross-cutting subsystems.*

* Hardening zero-dependency Node.js HTTP/SQLite engine (`node:http`, `node:sqlite`, `node:crypto`).
* Context propagation, operator isolation (`AsyncLocalStorage`, `X-Operator-ID`), and operator lifecycle management.
* Unified auth, session/token management, and rate-limiting infrastructure.
* In-process `EventBus` pub/sub backbone and base repository patterns.

---

## Phase 2: Base Entity & Inventory Management
>
> *Modeling physical and organizational assets and primary directory relationships.*

* **Properties & Units**: Portfolios, properties, and rentable unit inventory.
* **Contacts**: Multi-role directory management (tenants, owners, vendors, emergency contacts).
* Foundational entity relationships, validation schemas, and REST CRUD APIs.

---

## Phase 3: Core Property Operations (Leasing & Maintenance)
>
> *Digitizing everyday rental operations and workflow transitions.*

* **Leasing Lifecycle**: Draft, active, renewal, and termination workflows.
* **Maintenance & Work Orders**: Ticket submission, priority triage, vendor assignment, and resolution workflows.
* Cross-module operational event publishing (`lease.created`, `maintenance.completed`).

---

## Phase 4: Financial Ledger & Statutory Trust Accounting
>
> *Enforcing financial accuracy, auditability, and statutory regulatory compliance.*

* Immutable, append-only double-entry/cash ledger with strict integer-cents tracking (`journal_entries` and `journal_lines`).
* Statutory trust accounting fund segregation (`1010 Operating Checking` vs. `1020 Trust Checking` and `2100 Tenant Security Deposits Held Liability`).
* Automated Three-Way Bank Reconciliation verification schedules (Bank Balance = GL Trust Balance = Active Lease Liabilities).
* Standardized Chart of Accounts (IRS Schedule E expense lines and QuickBooks compatibility mapping).
* Automated transaction generation from operational events (rent charges, maintenance expenses, move-out deposit dispositions).
* Statutory move-out disposition timelines (jurisdiction-aware countdown alerts for CA, NY, TX, etc.).
* Vendor tax compliance (Tax ID tracking, W-9 verification, and annual IRS Form 1099-NEC aggregation reports).

---

## Phase 5: Native Presentation Layer & User Experience
>
> *Delivering the zero-framework, server-rendered operator interface.*

* Native TypeScript SSR presentation architecture (`web/lib/html.ts`, `node:http`), layout shells, and CSS custom properties design system.
* Operator dashboards, search, and CRUD views for properties, contacts, leases, and work orders.
* Financial reporting interfaces (income statements, rent roll, ledger balance views, and 3-way trust reconciliation schedules).
* Form validation, CSRF protections, and session handling.

---

## Phase 6: Data Portability, Resilience & Backup
>
> *Protecting operator data and enabling self-hosted operational independence.*

* Point-in-time database snapshotting and WAL checkpoint management.
* Operator data export/import workflows.
* Disaster recovery, automated scheduled backups, and database vacuuming routines.

---

## Phase 7: MVP Verification, Hardening & Self-Hosting Packaging
>
> *Final release criteria, security verification, and turn-key deployment readiness.*

* End-to-end integration and operator isolation regression test suites.
* Security review (input sanitization, CSP/XSS defense, timing-safe auth checks, and token spoofing prevention).
* Secure release packaging (Method 2: pre-packaged release archives with cryptographic SHA-256 checksum verification).
* Production packaging (Systemd / Supervisord configs, reverse proxy templates, and single-command local setup scripts).

---

## Sprint Execution Plan: All Planned Sprints

To bridge high-level architectural phases with practical development velocity, GarrisonOS organizes engineering work into two-week execution sprints. The sections below document all planned sprints across the road to MVP v0.1.0 and subsequent feature releases.

### Sprint 1 (Weeks 1–2): Core Foundation & Architecture Hardening
> **Status**: Completed (2026-09-17) | **Release Target**: v0.1.0-alpha

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
> **Status**: Completed (2026-09-17) | **Release Target**: v0.1.0-RC1

| Work Stream | Key Deliverables | Status |
| :--- | :--- | :---: |
| **Turnkey Production Packaging** | Provided hardened Systemd service unit (`deploy/systemd/garrison.service`) and multi-stage, zero-dependency Dockerfile (`node:24-alpine`) with turnkey `docker-compose.yml`, reverse proxy configs (Caddy / Nginx), and deployment guide. | ✅ Completed |
| **Interactive Operator Workflows** | Wired interactive modals and state machines in TypeScript SSR: vacant-unit turnover (`vacant` $\leftrightarrow$ `turnover` $\leftrightarrow$ `maintenance_hold`), lease renewals/terminations, and maintenance vendor dispatch. | ✅ Completed |
| **Vendor Tax & Specialization UI** | Exposed vendor trade specialization badges (Plumbing, HVAC, etc.) and visual W-9 verification flags in contacts directory and detail views with schema migration (`0002_add_vendor_w9.sql`). | ✅ Completed |
| **Router Trie / Static Precedence** | Refactored `api/router.ts` dispatch matching to guarantee literal static segments take precedence over parameterized wildcard segments, preventing route registration collisions. | ✅ Completed |
| **Token Security Hardening** | Enforced mandatory numeric `token_version` check in `verifyTokenWithDatabase()`, rejecting legacy unversioned tokens to guarantee 100% session revocability. | ✅ Completed |
| **End-to-End (E2E) Test Suite** | Implemented comprehensive multi-step user-journey test suite (`test/e2e/lifecycle.test.ts`) validating portfolio setup, leasing, trust deposits, rent runs, maintenance dispatch, move-out turnover, and ledger parity. | ✅ Completed |

---

### Sprint 3 (Weeks 5–6): Operator Lifecycle Administration, Security Audit & General Availability
> **Status**: Planned | **Release Target**: v0.1.0 (MVP GA)

| Work Stream | Key Deliverables | Target Phase |
| :--- | :--- | :---: |
| **Operator Lifecycle Management** | Implement full operator administration workflows: operator provisioning API (`POST /api/v1/system/operators` with legacy `/api/v1/system/tenants` compatibility alias), operator deactivation, and storage quota governance. | Phase 1 |
| **Global Rate Limiting** | Expand sliding-window in-memory rate limiting across all operational routes, safeguarding against denial-of-service and brute-force ingress. | Phase 1, 7 |
| **Third-Party Security Audit** | Conduct formal pre-release penetration review: timing-safe cryptographic comparisons, strict CSP enforcement, session replay resistance, and fail-closed installer tests. | Phase 7 |
| **Automated Release Pipeline** | Implement GitHub Actions workflow building verified release tarballs with cryptographic `SHA256SUMS` and detached GPG/minisign signatures matching installer expectations. | Phase 7 |
| **Deployment & Operator Docs** | Finalize Self-Hosting Administrator Handbook, single-server deployment runbooks, operational disaster recovery procedures, and API contract specifications. | Phase 7 |

---

### Sprint 4 (Weeks 7–8): Tenant Self-Service, Preventative Maintenance & Communications
> **Status**: Planned | **Release Target**: v0.2.0

| Work Stream | Key Deliverables | Target Phase |
| :--- | :--- | :---: |
| **Tenant Self-Service Portal** | Build passwordless magic-link tenant portal for balance inspection, payment receipt downloads, and maintenance ticket submissions. | Post-MVP |
| **Automated Communications** | Implement pluggable zero-dependency notification dispatcher (SMTP / sendmail / webhook) for rent invoices, late notices, and lease expiration alerts. | Post-MVP |
| **Property Inspection Checklists** | Add structured digital move-in and move-out condition inspection checklists with localized photo attachment storage. | Post-MVP |
| **Preventative Maintenance** | Add recurring preventative maintenance schedules (HVAC filter replacements, smoke detector audits, seasonal winterization). | Post-MVP |
| **Ledger Performance Optimization** | Introduce periodic balance snapshotting / checkpointing for long-running tenancies with high transaction counts. | Phase 4 |

---

### Sprint 5 (Weeks 9–10): Dual-Engine Architecture & Native PostgreSQL Integration
> **Status**: Planned | **Release Target**: v0.3.0

| Work Stream | Key Deliverables | Target Phase |
| :--- | :--- | :---: |
| **Native PostgreSQL Driver** | Implement drop-in native PostgreSQL database engine integration satisfying strict ANSI/PostgreSQL DDL standards established in `AGENTS.md`. | Post-MVP |
| **Dual-Engine Migration Runner** | Extend migration runner to validate and execute migrations cleanly across both embedded SQLite and external PostgreSQL targets. | Post-MVP |
| **Multi-Node Horizontal Scaling** | Support multi-instance GarrisonOS node clusters behind reverse proxies with centralized PostgreSQL connection pooling. | Post-MVP |
| **Shared Media Storage** | Support S3-compatible object storage drivers for multi-node deployments while maintaining zero-dependency native Node.js HTTP/crypto implementation. | Post-MVP |

---

### Sprint 6 (Weeks 11–12): Commercial Real Estate (CRE) & Integrated Banking Rails
> **Status**: Planned | **Release Target**: v0.4.0

| Work Stream | Key Deliverables | Target Phase |
| :--- | :--- | :---: |
| **Commercial Leases & CAM** | Implement Commercial Organizations (reserving `organization` entity), Triple Net (NNN) lease contracts, Common Area Maintenance (CAM) reconciliations, and administrative expense pool allocations. | Post-MVP |
| **CPI Lease Escalations** | Add automated annual Consumer Price Index (CPI) and fixed percentage lease rate escalation calculation engines. | Post-MVP |
| **Bank Feed Ingestion** | Build native OFX, QBO, and CSV bank statement import parser with heuristic transaction matching against general ledger entries. | Post-MVP |
| **Tenant Payment Rails** | Add payment gateway webhook ingestion and automated settlement journal entries for external payment processors. | Post-MVP |

---

## Post-MVP Phase: Scalability, Native PostgreSQL & Ecosystem Expansion
>
> *Extending platform capacity, database drivers, and advanced real estate capabilities.*

* **Native PostgreSQL Driver**: Drop-in PostgreSQL database engine integration leveraging strict ANSI/PostgreSQL DDL standards established in `AGENTS.md`.
* **Commercial Real Estate (CRE)**: Common Area Maintenance (CAM) reconciliations, Triple Net (NNN) expense pools, and CPI lease escalation schedules.
* **Integrated Payment Gateways**: Automated ACH debit/credit rails and live bank feed interoperability (OFX/QBO/Plaid).
* **Multi-Instance Clustering**: Scalable multi-operator node clusters with centralized connection pooling.
