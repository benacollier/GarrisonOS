# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Enforce strict token-derived `userId` in `tenantContextMiddleware` and reject mismatched `X-User-ID` headers to prevent identity spoofing.
- Require administrator role verification for system backup endpoint (`/api/v1/system/backup`).
- Fix `EventBus.publish` to synchronously capture and inherit active `RequestContext` (`tenantId`, `correlationId`, `userId`) when payloads omit explicit context.
- Make `withTransaction` callbacks strictly synchronous in `database/seed.ts` and `api/server.ts` to prevent premature transaction commits.
- Encapsulate lease balance calculation, deduction processing, and lease status updates atomically inside a transaction within `AccountingRepository.processDepositDisposition`.
- Modernize test helpers and test suites with ANSI/PostgreSQL-compatible queries (`ON CONFLICT (id) DO NOTHING`).
- Replace non-deterministic timer sleeps (`setTimeout`) in `test/context.test.ts` and `modules/maintenance/test/maintenance.test.ts` with deterministic event listener completions.
- Cast all rendered values to string inside `htmlspecialchars()` across `web/pages/dashboard.php` for PHP 8.1+ compatibility.

### Added

- Comprehensive test coverage for `tenantContextMiddleware` verifying token tenant matching, `X-User-ID` spoofing rejection, and owner-only administrative authorization.
- Unit test coverage for `Router.getBatchSafe()`, `Router.getUnsafe()`, and `Router.isBatchSafeGetPath()`.
- Error handling test for `AccountingRepository.processDepositDisposition`.

### Changed

- Added least-privilege `permissions: contents: read` to CI GitHub workflow.
- Pinned all GitHub Actions in `pages.yml` to immutable commit SHAs.
- Updated technical debt action plan to mark resolved architectural items.
