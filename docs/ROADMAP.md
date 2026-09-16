# GarrisonOS MVP Roadmap

This document outlines the high-level roadmap to MVP for **GarrisonOS**, structured into logically sequenced milestone categories. Subgroups, user stories, and technical tasks will be layered into each phase as development progresses.

---

## Phase 1: Core Engine & Multi-Tenant Foundation
>
> *Establishing runtime infrastructure, database primitives, security boundaries, and cross-cutting subsystems.*

* Hardening zero-dependency Node.js HTTP/SQLite engine (`node:http`, `node:sqlite`, `node:crypto`).
* Context propagation, tenant isolation (`AsyncLocalStorage`, `X-Tenant-ID`), and tenant lifecycle management.
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

* PHP-FPM presentation architecture, layout shells, and CSS custom properties design system.
* Operator dashboards, search, and CRUD views for properties, contacts, leases, and work orders.
* Financial reporting interfaces (income statements, rent roll, ledger balance views, and 3-way trust reconciliation schedules).
* Form validation, CSRF protections, and session handling.

---

## Phase 6: Data Portability, Resilience & Backup
>
> *Protecting tenant data and enabling self-hosted operational independence.*

* Point-in-time database snapshotting and WAL checkpoint management.
* Tenant data export/import workflows.
* Disaster recovery, automated scheduled backups, and database vacuuming routines.

---

## Phase 7: MVP Verification, Hardening & Self-Hosting Packaging
>
> *Final release criteria, security verification, and turn-key deployment readiness.*

* End-to-end integration and tenant isolation regression test suites.
* Security review (input sanitization, CSP/XSS defense, timing-safe auth checks, and token spoofing prevention).
* Secure release packaging (Method 2: pre-packaged release archives with cryptographic SHA-256 checksum verification).
* Production packaging (Systemd / Supervisord configs, reverse proxy templates, and single-command local setup scripts).

---

## Post-MVP Phase: Scalability, Native PostgreSQL & Ecosystem Expansion
>
> *Extending platform capacity, database drivers, and advanced real estate capabilities.*

* **Native PostgreSQL Driver**: Drop-in PostgreSQL database engine integration leveraging strict ANSI/PostgreSQL DDL standards established in `AGENTS.md`.
* **Commercial Real Estate (CRE)**: Common Area Maintenance (CAM) reconciliations, Triple Net (NNN) expense pools, and CPI lease escalation schedules.
* **Integrated Payment Gateways**: Automated ACH debit/credit rails and live bank feed interoperability (OFX/QBO/Plaid).
* **Multi-Instance Clustering**: Scalable multi-tenant node clusters with centralized connection pooling.
