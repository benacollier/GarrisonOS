# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **Sprint 3.1: Operator Administration, Storage Quotas & Global Rate Limiting**:
  - **Operator Provisioning API (`POST /api/v1/system/operators`)**: Introduced transactional operator onboarding endpoint strictly protected by platform administrative credentials (`APP_SECRET`). Validates operator name, contact email, and minimum 8-character password. Rejects unprivileged or tenant-level owner tokens with 403 Forbidden to guarantee multi-operator isolation. Persists operator record, initial owner user with scrypt password hashing, seeds default Chart of Accounts, records audit log, and returns 201 Created. Enforces 409 Conflict rollback on duplicate emails or explicit subdomain collisions, and automatically disambiguates auto-generated subdomains on duplicate names.
  - **Path-Based and Subdomain Routing**: Added configurable operator resolution via `OPERATOR_ROUTING_MODE` (`subdomain`, `path`, or `both`), supporting URL path prefixes (`/o/:slug/...` or `/operator/:slug/...`) as a flexible alternative to DNS subdomains while enforcing strict cross-operator identity agreement.
  - **Storage Quotas**: Added migration `0003_add_operator_storage_quota.sql` introducing `storage_quota_bytes INTEGER NOT NULL DEFAULT 10737418240` (10 GB default). Quota is configurable per operator on provisioning and globally defaulted via `DEFAULT_STORAGE_QUOTA_BYTES`.
  - **Global Rate Limiting Middleware**: Implemented sliding-window rate limiter in `api/middleware.ts` applying across all routes without unconstrained exemptions. Limits are configurable via environment variables (`RATE_LIMIT_OPERATOR_MAX`, `RATE_LIMIT_OPERATOR_WINDOW_MS`, `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_AUTH_WINDOW_MS`, `RATE_LIMIT_PUBLIC_MAX`, `RATE_LIMIT_PUBLIC_WINDOW_MS`). Keys by `operator_id` when authenticated and client IP on unauthenticated routes, with multi-hop proxy sanitization on `X-Forwarded-For`. Returns standard 429 `RATE_LIMITED` envelope with `Retry-After` header. Includes automatic unref'd timer eviction of expired rate limit entries to prevent memory leaks (`evictExpiredRateLimits`).
  - **Removal of Legacy Operator "Tenants" Aliases**: Completely eliminated all legacy aliases and backwards compatibility to the old `tenants` operator naming across the core database, APIs, runtime context, session storage, web presentation, and test suites. Dropped legacy `tenants` database view, removed `RequestContext.getTenantId()`, removed `tenantId` / `tenant_id` from session models, token inputs, API requests, and web templates, and updated all test suites to use `runInOperatorContext` and `ensureOperator`.
  - **Comprehensive Verification**: Added dedicated integration tests in `test/api/system-operators.test.ts` and `test/api/rate-limit.test.ts`, and verified end-to-end multi-operator isolation, rate limiting enforcement, and operator provisioning across 31 passing test suites.

- **Foundational MVP Roadmap Re-Alignment & Clean-Room Architecture**:
  - Re-indexed upcoming sprints (Sprints 3 through 7) and formally established the completion of **Sprint 5 (`v0.1.0 GA`)** as the Foundational General Availability MVP milestone.
  - Authored canonical clean-room architecture specifications: `docs/architecture/domain-models.md` (complete SQL DDL, column definitions, check constraints, foreign keys, and indexes) and `docs/architecture/api-spec.md` (complete REST endpoint contracts, query parameters, payload schemas, and EventBus topics).
  - Incorporated **Client Portfolio Accounting & Management Fees** (portfolio fiduciary accounting, capital contributions, client distributions, and fee agreements) into the Foundational MVP scope (Sprint 4).
  - Scheduled pre-MVP **Universal Attachments Subsystem** with document safety hygiene (automated EXIF stripping, bounded downsampling, PDF executable script sanitization) and **Media Backup Integration** in Sprint 3.
  - Scheduled **Public-Facing Tenant Self-Service Portal** on an isolated subdomain (`portal.<domain>`), **Packaged GUI Installers** (turnkey click-through Windows/macOS/Linux setup wizards), **Accounts Payable (AP)**, **Zero-Dependency PDF Vendor Check Printing** (ANSI X9.100-140 standard check stock), and **Bank Deposit Batching** in Sprint 5.
  - Scheduled **Admin Management GUI Subsystem** (error reporting, health telemetry, dynamic module status) and **Configurable Role-Based Access Control (RBAC)** in Sprint 3.
  - Scheduled **Deprecation & Removal of Legacy Single-Entry Accounting** (`transactions` table sunset and `tenants` view cleanup) in Sprint 4.
  - Cataloged clean-room Post-MVP Future Horizons (SMS Messaging Rails, Client Portal, Property Inspections, Prospects CRM, Work Order Tasks & Timecards, Enterprise Bulk APIs).
  - Synchronized `docs/ROADMAP.md`, `docs/LLMREVIEW20260915.md`, `docs/architecture/bootstrap-spec.md`, `docs/modules/overview.md`, and `docs/README.md`.

- **Sprint 2: Production Readiness, Operator Workflows & Release Candidate (v0.1.0-RC1)**:
  - **Turnkey Production Packaging**: Introduced production-grade Systemd service unit (`deploy/systemd/garrison.service`) with full security sandboxing, multi-stage zero-dependency Alpine Dockerfile (`Dockerfile`) executing under an unprivileged `garrison` system user, turnkey `docker-compose.yml`, production reverse proxy configurations for automatic Let's Encrypt TLS in Caddy (`deploy/caddy/Caddyfile`) and hardened Nginx (`deploy/nginx/nginx.conf`), and a comprehensive Self-Hosting Operator Runbook (`docs/deployment/production-guide.md`).
  - **Interactive Operator Workflows**: Added native TypeScript SSR interactive workflows and modal dialogs for vacant-unit turnover (`vacant` $\leftrightarrow$ `turnover` $\leftrightarrow$ `maintenance_hold`) with auto-generated make-ready work orders in `modules/properties/frontend/pages/show.ts`, lease renewals and statutory move-out dispositions in `modules/leases/frontend/pages/show.ts`, and direct contractor dispatch in `modules/maintenance/frontend/pages/show.ts`.
  - **Vendor Tax & Specialization UI**: Added schema migration (`modules/contacts/backend/migrations/0002_add_vendor_w9.sql`) adding `w9_received` verification flag and `tax_classification` to contacts, with visual trade specialization badges (Plumbing, HVAC, Electrical, etc.) and W-9 verification alerts in the contacts directory and detail views.
  - **Static-First Router Precedence**: Refactored `api/router.ts` dispatch matching to enforce static segment precedence over parameterized wildcard segments (`:param`), completely eliminating registration order sensitivity and collision hazards (Technical Debt #125).
  - **Stateless Token Security Hardening**: Enforced mandatory numeric `token_version` checking in `verifyTokenWithDatabase()` in `core/crypto.ts`, rejecting legacy unversioned tokens to guarantee 100% token revocability across all active sessions (Technical Debt #126).
  - **End-to-End Lifecycle Test Suite**: Implemented comprehensive user-journey integration test suite (`test/e2e/lifecycle.test.ts`) validating operator provisioning, portfolio creation, tenant/vendor onboarding, lease execution, fiduciary security deposit trust receipt (`1020` vs `2100`), monthly rent billing and operating cash collection (`1010` vs `4010`), emergency maintenance dispatch, lease move-out turnover, and ledger balance zero-sum parity.
  - **Expanded Demo Seed Data & Review Hardening**: Addressed all CodeRabbit and Sourcery PR review feedback. Expanded `database/seed.ts` to 20 units representing all 4 unit statuses (`occupied`, `vacant`, `turnover`, `maintenance_hold`), 1 terminated lease with notice and move-out history (`0002_add_lease_termination_dates.sql`), 7 W-9 vendors, 1099-NEC payments, and 8 work orders. Added automated test suite `test/seed.test.ts`. Hardened reverse proxy upstream routing to presentation port `8080`, enforced W-9 and trade checks on maintenance dispatch, and validated `tax_classification` options.

- **Multi-Operator Architecture & Real-Estate Domain Tenant Clarification**:
  - Replaced ambiguous, conflicting usage of "tenant" for software infrastructure isolation with **Operator** (`operators` table, `operator_id` foreign keys, `RequestContext.getOperatorId()`, and `X-Operator-ID` HTTP headers).
  - Reserved **Organization** for commercial property portfolios and future commercial entity support.
  - Strictly preserved real-estate domain terminology for human occupants and rental mechanics: `contact_type = 'tenant'`, `role = 'primary_tenant' | 'co_tenant'`, `Tenant Ledger`, `calculateTenantBalance()`, `Account 2100 Tenant Security Deposits Held Liability`, and "Leases & Tenants" navigation.
  - Maintained backward compatibility via an ANSI SQL view (`CREATE VIEW tenants AS SELECT * FROM operators`), aliases for `RequestContext.getTenantId()`, dual-header support (`X-Operator-ID` and `X-Tenant-ID`), and fallback session getters.
  - Hardened multi-operator security: fail-closed token creation requiring explicit operator claims, defensive operator stamping on EventBus emissions, cross-operator IDOR validation on work orders, bounded numeric query parsing, and 100% TSDoc docstring coverage on all public exports.
  - Updated all migrations, database seeders, API middleware, repositories, services, web presentation templates, hygiene scanners (`scripts/check-hygiene.js`), and test suites across all modules.
- Synchronized project documentation across `docs/ROADMAP.md`, `docs/LLMREVIEW20260915.md`, `docs/architecture/technical-debt.md`, and `README.md` to establish the comprehensive execution roadmap for all planned sprints (Sprints 1 through 6) through MVP v0.1.0 GA and post-MVP releases.
- Hardened presentation-layer validation, error handling, session and API transport security, multipart upload preservation, and filtered accounting exports.
- **Complete Rebase to 100% Pure TypeScript**: Eliminated all 39 legacy PHP files (4,318 lines of code) across `web/` and all domain modules (`modules/*/frontend/`), transitioning the entire presentation layer to a native Server-Side Rendered (SSR) TypeScript architecture.
- **Zero-Dependency Presentation Subsystem**: Implemented native TypeScript web presentation server (`web/server.ts`), front controller and router (`web/router.ts`), safe HTML tagged template system with automatic contextual XSS escaping (`web/lib/html.ts`), HMAC-SHA256 signed cookie session manager (`web/lib/session.ts`), timing-safe constant-time CSRF guard (`web/lib/csrf.ts`), dynamic UI hook registry (`web/lib/hooks.ts`), and static asset streaming handler with directory traversal guards (`web/static.ts`).
- **Operational & Tooling Modernization**: Updated process supervisor (`scripts/serve.js`), setup validator (`scripts/setup.js`), installers (`scripts/install.sh`, `scripts/install.ps1`), and compliance scanner (`scripts/check-hygiene.js`) to remove all PHP runtime dependencies, extension requirements (`curl`, `session`, `filter`, `pdo_sqlite`), and enforce 100% pure TypeScript repository compliance.
- **Presentation Layer Test Suite**: Added dedicated automated unit test suites for the web presentation layer (`web/test/html.test.ts`, `web/test/session.test.ts`, `web/test/csrf.test.ts`, `web/test/router.test.ts`), bringing total automated test suites to 26 passing with 0 failures.
- Added dedicated **Automation & Maintenance** operator card in `modules/backup/frontend/pages/index.ts` providing real-time daemon status, cadence indicators, and CSRF-protected triggers for on-demand scheduled backups and vacuum routines.
- Updated module manifest (`modules/backup/module.json`) and deployment documentation (`docs/deployment/backup-and-maintenance.md`) to reflect automated in-process scheduling and worker-thread maintenance routines.
- Updated project review analysis (`docs/LLMREVIEW20260915.md`) marking Phase 6 complete and Backup module health at 98% (A+).
- Harden the backup scheduler with bounded configuration, owner-only manual triggers, mutually exclusive worker-thread maintenance, independent retention error reporting, and shutdown waits for active operations.
- Handle natural and compound unique key conflicts during merge restores in `modules/backup/backend/service.ts` to replace conflicting rows cleanly without unique constraint failures.
- Fail closed on signal termination (`code === null`) in `scripts/test.js` to report runner termination and prevent CI false-passes.
- Enforce cryptographic digest computation, comparison, and fail-closed abort verification patterns for installer scripts in `scripts/check-hygiene.js`.
- Convert dynamic table queries and backup restoration queries in `modules/backup/backend/service.ts` to ANSI-standard PostgreSQL-compatible SQL (`ON CONFLICT (id) DO UPDATE` instead of `INSERT OR REPLACE`).
- Resolve markdownlint formatting errors across all documentation and root markdown files (`AGENTS.md`, `README.md`, `docs/LLMREVIEW20260915.md`).
- Enforce strict token-derived `userId` in `tenantContextMiddleware` and reject mismatched `X-User-ID` headers to prevent identity spoofing.
- Require owner role verification for system backup endpoint (`/api/v1/system/backup`).
- Fix `EventBus.publish` to synchronously capture and inherit active `RequestContext` (`tenantId`, `correlationId`, `userId`) when payloads omit explicit context.
- Make `withTransaction` callbacks strictly synchronous in `database/seed.ts` and `api/server.ts` to prevent premature transaction commits.
- Encapsulate lease balance calculation, deduction processing, and lease status updates atomically inside a transaction within `AccountingRepository.processDepositDisposition`.
- Modernize test helpers and test suites with ANSI/PostgreSQL-compatible queries (`ON CONFLICT (id) DO NOTHING`).
- Replace non-deterministic timer sleeps (`setTimeout`) in `test/context.test.ts` and `modules/maintenance/test/maintenance.test.ts` with deterministic event listener completions.
- Cast all rendered values to string inside `htmlspecialchars()` across `web/pages/dashboard.php` for PHP 8.1+ compatibility.

### Added

- In-process automated backup and database maintenance scheduler daemon (`BackupScheduler` in `modules/backup/backend/scheduler.ts`) executing periodic point-in-time full database snapshots (`garrison-db-<timestamp>.sqlite.gz`), WAL truncation, optimizer-statistics updates (`PRAGMA optimize`), database page reclamation (`VACUUM`), and retention policy pruning without external cron dependencies.
- Administrative scheduler status endpoint (`GET /api/v1/backups/scheduler/status`) and manual trigger endpoint (`POST /api/v1/backups/scheduler/trigger`).
- Development tooling and repository verification guide (`docs/development/tooling.md`) and unified root acknowledgements and attributions registry (`ATTRIBUTIONS.md`).
- Low-token test runner reporter in `scripts/test.js` outputting single-line pass summaries and emitting full diagnostic output only on failure.
- Unified architectural and compliance validation scanner in `scripts/check-hygiene.js` enforcing zero runtime dependencies, strict equality, synchronous SQLite, parameterized SQL, tenant parameter isolation, and fail-closed scripts in <150ms.
- Section 7 Agent Tool & Context Hygiene Directives in `AGENTS.md` mandating line-range slicing on `view_file` and mechanical test/hygiene verification over raw context ingestion.
- Workspace ignore configurations (`.geminiignore` and `.ignore`) excluding build outputs, WAL databases, coverage artifacts, and binary assets from whole-directory agent indexing.
- Statutory trust accounting non-commingling validation invariant in `JournalService.postEntry` preventing unauthorized commingling of account `1020` with operating revenue/expenses.
- Three-Way Bank Reconciliation report service (`AccountingRepository.getThreeWayReconciliation`) and endpoint (`GET /api/v1/accounting/reconciliation/three-way`) supporting empirical bank statement balances and historical active lease cutoff parity.
- Annual IRS Form 1099-NEC vendor expense aggregation report service (`AccountingRepository.getVendor1099Report`) and endpoint (`GET /api/v1/accounting/reports/1099-nec`) with dynamic tax-year threshold selection and reversal exclusion.
- Statutory move-out deposit deduction deadline and countdown calculation (`AccountingRepository.getStatutoryDispositionTimeline`) and endpoint (`GET /api/v1/accounting/disposition/timeline`) with supported jurisdiction validation.
- Comprehensive automated compliance test suite (`modules/accounting/test/compliance.test.ts`).
- Cryptographic SHA-256 checksum verification during release archive downloads in `scripts/install.sh` and `scripts/install.ps1` with fail-closed integrity validation.
- Comprehensive test coverage for `tenantContextMiddleware` verifying token tenant matching, `X-User-ID` spoofing rejection, and owner-only administrative authorization.
- Unit test coverage for `Router.getBatchSafe()`, `Router.getUnsafe()`, and `Router.isBatchSafeGetPath()`.
- Error handling test for `AccountingRepository.processDepositDisposition`.
- Section 6 Security Blast Radius & Defensive Engineering Guardrails in `AGENTS.md` covering downstream blast radius mapping, ingress route authentication, zero-trust parameter validation, and fail-closed security invariants.
- Automated zero-dependency security blast radius checker script (`scripts/check-security.js`) and corresponding npm script `npm.cmd run check:security`.
- Workspace security recommendations in `.vscode/extensions.json` and security verification tasks in `.vscode/tasks.json`.

### Changed

- Modernized `README.md` to clarify residential portfolio focus (<50 units), elevate statutory trust accounting to in-scope MVP Phase 4, synchronize the Project Milestones table with recent pull requests, document Method 2 verified release archive installations, and declare non-profit foundation stewardship under AGPLv3 Section 7(b).
- Updated `docs/ROADMAP.md` with statutory trust accounting deliverables in Phase 4 and formal post-MVP PostgreSQL scalability trajectory.
- Hardened `scripts/install.sh` and `scripts/install.ps1` to deprecate bare pipe-to-shell execution in favor of verified release archive extraction with cryptographic validation.
- Added least-privilege `permissions: contents: read` to CI GitHub workflow.
- Pinned all GitHub Actions in `pages.yml` to immutable commit SHAs.
- Updated technical debt action plan to mark resolved architectural items.
