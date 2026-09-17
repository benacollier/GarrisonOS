# Development Tooling & Verification Guide

This guide documents the development tooling, test reporter, and repository compliance scanner utilized across the GarrisonOS developer environment. For complete open-source attributions and third-party notices, see [ATTRIBUTIONS.md](../../ATTRIBUTIONS.md).

---

## 1. Test Reporter & Diagnostic Harness

* **Script**: `scripts/test.js`
* **Default Behavior**: Buffers `node:test` execution and outputs a single succinct line on success:

  ```text
  ✔ All test suites passed (21 suites in 1.29s, 0 failures).
  ```

  *(Maintains a clean terminal output while preserving context).*
* **Failure Mode**: Immediately dumps full stdout/stderr, failed assertions, and stack traces on any failure.
* **Diagnostic Flag**: Supports `--verbose` or `-v` (`npm test -- --verbose` or `node scripts/test.js --verbose`) for manual full TAP/spec logs.

---

## 2. Comprehensive Repository Compliance Scanner

* **Script**: `scripts/check-hygiene.js`
* **Execution**: `npm run check:hygiene` or `npm run check` (runs in <150ms with zero runtime dependencies).
* **Automated Invariant Checks**:
  1. **Dependency Whitelist**: Enforces standard `node:*` and relative imports. Rejects prohibited npm packages (`express`, `zod`, `uuid`, etc.).
  2. **Strict Equality**: Enforces `===` and `!==` across all TypeScript and PHP source code.
  3. **Synchronous SQLite Invariant**: Flags any `await db.prepare` or `await db.exec` on `node:sqlite.DatabaseSync`.
  4. **Operator Isolation**: Flags `:operator_id` or `:tenant_id` appearing in API route paths or client request bodies/queries.
  5. **SQL Portability**: Enforces parameterized queries (`?`), PostgreSQL compatibility (rejects `AUTOINCREMENT`, `INSERT OR REPLACE/IGNORE`), and UTC timestamps (rejects SQLite `datetime` functions).
  6. **Fail-Closed Security**: Validates cryptographic SHA256 checksum verification and non-zero exit codes in installer scripts.
  7. **Host Path & Credential Hygiene**: Scans for host-specific absolute filesystem paths and exposed credentials or secrets.
