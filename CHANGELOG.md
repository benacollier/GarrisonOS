# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
