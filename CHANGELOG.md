# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Enforce strict token-derived `userId` in `tenantContextMiddleware` and reject mismatched `X-User-ID` headers to prevent identity spoofing.
- Require owner role verification for system backup endpoint (`/api/v1/system/backup`).
- Fix `EventBus.publish` to synchronously capture and inherit active `RequestContext` (`tenantId`, `correlationId`, `userId`) when payloads omit explicit context.
- Make `withTransaction` callbacks strictly synchronous in `database/seed.ts` and `api/server.ts` to prevent premature transaction commits.
- Encapsulate lease balance calculation, deduction processing, and lease status updates atomically inside a transaction within `AccountingRepository.processDepositDisposition`.
- Modernize test helpers and test suites with ANSI/PostgreSQL-compatible queries (`ON CONFLICT (id) DO NOTHING`).
- Replace non-deterministic timer sleeps (`setTimeout`) in `test/context.test.ts` and `modules/maintenance/test/maintenance.test.ts` with deterministic event listener completions.
- Cast all rendered values to string inside `htmlspecialchars()` across `web/pages/dashboard.php` for PHP 8.1+ compatibility.

### Added

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
