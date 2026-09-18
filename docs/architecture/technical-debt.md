# GarrisonOS: Architectural Review & Technical Debt Assessment

This document provides a technical critique of the GarrisonOS architecture, runtime boundaries, and subsystem designs. It captures architectural trade-offs, potential edge-case failure modes, and engineering recommendations for future development cycles.

---

## 1. HTTP Router, Dispatch Precedence & Validation

### Current State

* Custom zero-dependency regex HTTP router (`api/router.ts`) matching against standard verbs (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`).
* Route parameter extraction relies on greedy capture groups (`([^/]+)`).
* Request validation is implemented imperatively inside each route handler across `modules/*/backend/routes.ts`.

### Identified Risks & Limitations

* **Route Order Sensitivity (Collision Hazard)**: Because route matching evaluates registered regular expressions sequentially, parameterized routes can intercept static sub-paths if registered out of order. For example, `/api/v1/properties/units` must be declared before `/api/v1/properties/:id` to avoid `:id` consuming the literal string `"units"`.
* **Imperative Validation Inconsistencies**: Without a centralized schema validation layer, validation logic across modules relies on manual checks (`if (!field)` or `parseInt()`). This leads to minor variations in HTTP error detail formatting, missing type coercion edge cases, and boilerplate duplication.

### Recommendations

1. Transition `Router` to a radix tree (Trie-based) router or enforce strict static segment priority over parameterized segments.
2. Introduce a lightweight, zero-dependency declarative validation utility (e.g., standard descriptor functions for strings, UUIDs, integer cents, and dates) that generates uniform `VALIDATION_ERROR` payloads.

---

## 2. Multi-Tenancy & Asynchronous Context Propagation

### Current State

* Strict multi-tenancy enforced through `AsyncLocalStorage` in `core/context.ts`.
* Inbound requests resolve tenant identity via `X-Tenant-ID` header or verified HMAC token in `api/middleware.ts`.
* Repositories extract `tenantId` implicitly from `RequestContext.getTenantId()`.
* **Resolved Context Propagation**: Asynchronous context loss across event loop boundaries has been resolved in `EventBus.publish()`, which synchronously captures the active `RequestContext` (including `tenantId`, `correlationId`, and `userId`) prior to dispatching via `setImmediate()` and executes subscriber callbacks wrapped in `RequestContext.run()`.

### Identified Risks & Limitations

* **Coupled Middleware Public Route Registry**: In `api/middleware.ts`, public endpoints (`/health`, `/ready`, `/api/v1/auth/*`, `/api/v1/system/backup`) are hardcoded directly into the tenant resolution middleware. Modules cannot declare public or webhook endpoints independently without modifying core middleware.

### Recommendations

1. Allow route registration to specify metadata flags (e.g., `router.get(path, { isPublic: true }, ...handlers)`) to decouple endpoint access control from global middleware logic.

---

## 3. Dynamic Module Lifecycle & Migration Ordering

### Current State

* Modules reside under `modules/[module_name]/` and export `module.json` manifests.
* `database/migrator.ts` auto-discovers core migrations and module migrations sequentially at startup.
* `core/module-loader.ts` mounts routes and binds event subscribers.

### Identified Risks & Limitations

* **Alphabetical Migration Execution vs. Foreign Key Dependencies**: Migrations are currently discovered and sorted alphabetically by module directory name (`readdirSync().sort()`), resolving to `accounting` $\rightarrow$ `contacts` $\rightarrow$ `leases` $\rightarrow$ `maintenance` $\rightarrow$ `properties`. Tables in `accounting` and `leases` maintain foreign keys to `properties` and `contacts`. While SQLite permits table creation with deferred foreign key references, any module seeding initial data or executing DDL during migrations risks foreign key constraint violations.
* **ESM Resolution Fallback**: `core/module-loader.ts` attempts to dynamically import compiled `.js` files from `dist/` and falls back to `.ts` in `modules/`. In standard Node.js ESM runtime environments, importing raw `.ts` files directly will fail unless an on-the-fly loader is configured.

### Recommendations

1. Implement topological dependency sorting in `database/migrator.ts` using the `"dependencies"` array defined in each `module.json`.
2. Make module loading strictly require compiled assets in production, providing explicit diagnostic errors if the build artifact is missing.

---

## 4. Presentation Layer Architecture & Efficiency

### Current State

* Presentation layer completely rebased to **100% pure TypeScript SSR** (`web/lib/html.ts`, `web/server.ts`, `node:http`), entirely eliminating legacy PHP runtime dependencies.
* Server-rendered HTML templates with automatic contextual XSS escaping (`html` tagged template).
* HMAC-SHA256 signed cookie sessions and timing-safe CSRF validation.
* Presentation layer communicates with the API engine via local loopback or shared in-process utilities.

### Resolution & Evolution

* **Dual-Runtime Elimination**: The operational complexity of maintaining dual runtimes (Node.js and PHP) has been completely eliminated. GarrisonOS now deploys as a single, unified Node.js application.
* **Batch Endpoint Hydration**: Sequential overhead has been mitigated with the implementation of `/api/v1/batch` (Sprint 1). Further aggregation into direct shared controller execution is planned for post-MVP.

---

## 5. Financial Ledger & Trust Accounting

### Current State

* Native double-entry general ledger (`journal_entries` and `journal_lines`) enforcing strict zero-sum debit/credit balance proofs across all transactions.
* Statutory fiduciary trust accounting segregating operating funds (`1010 Operating Checking`) from tenant security deposits (`1020 Security Deposit Trust Checking` and `2100 Tenant Security Deposits Held Liability`).
* Automated Three-Way Bank Reconciliation verification schedules proving parity across bank statements, general ledger trust accounts, and active lease deposit liabilities.
* Tax categorization directly aligned with IRS Schedule E expense lines and QuickBooks compatibility (QBO, IIF, OFX).
* Automated monthly rent generation with mid-month proration and idempotency keys (`rent_charge:{lease_id}:{YYYY_MM}`).

### Remaining Optimizations

* **Running Balance Checkpointing**: Tenant running balances are calculated dynamically across lease transaction histories. While optimal for small portfolios (<50 units), periodic balance snapshotting/checkpointing is scheduled for Sprint 4.

---

## 6. Security, Authentication & Session Hygiene

### Current State

* Password hashing using native `node:crypto.scrypt` with random 16-byte salt and constant-time verification (`timingSafeEqual`).
* Stateless HMAC-SHA256 session tokens with `token_version` tracking in the database for instant revocation.
* CSRF validation for all state-modifying requests in the TypeScript presentation layer.
* Sliding-window in-memory rate limiting on authentication routes.
* Fail-closed `APP_SECRET` verification on startup outside development and test environments.

### Evolution & Action Items

* **Legacy Token Invalidation**: Support for legacy unversioned tokens without a `tv` claim is scheduled for formal deprecation and removal in Sprint 2, ensuring 100% of tokens are revocable through `token_version`.
* **Global Rate Limiting**: Expanding sliding-window rate limiting across all operational routes is scheduled for Sprint 3.

---

## 7. Action Plan & Prioritized Matrix

| Priority | Subsystem | Issue | Action Item | Scheduled Sprint | Status |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **High** | **Context & Events** | Context loss in async event handlers | Auto-propagate `RequestContext` in `EventBus.publish()` | Sprint 1 | **Resolved** (PR #17) |
| **High** | **Database Migrator** | Alphabetical migration execution | Topological sort migrations by `dependencies` in `module.json` | Sprint 1 | **Resolved** (PR #17) |
| **High** | **Accounting** | Statutory trust reconciliation reporting | Implement non-commingling rules and 3-way bank rec | Sprint 1 | **Resolved** (PR #20) |
| **High** | **Presentation Layer** | Dual-runtime operational complexity | Rebase to 100% pure TypeScript SSR | Sprint 1 | **Resolved** (PR #24) |
| **Medium** | **Frontend API** | Sequential overhead on composite pages | Provide composite/batch API endpoint (`/api/v1/batch`) | Sprint 1 | **Resolved** (PR #19) |
| **Medium** | **Packaging** | Lack of production supervision & containerization | Add Systemd service unit, Dockerfile & docker-compose | Sprint 2 | **Resolved** |
| **Medium** | **HTTP Router** | Linear regex matching order sensitivity | Introduce static-first segment precedence in route dispatcher | Sprint 2 | **Resolved** |
| **Medium** | **Security** | Legacy HMAC tokens without `tv` cannot be revoked | Enforce `token_version` requirement in database-backed verification (`verifyTokenWithDatabase`) | Sprint 2 | **Resolved** |
| **Medium** | **Multi-Tenancy** | Tenant lifecycle governance | Add tenant provisioning, deactivation & storage quotas | Sprint 3 | **Planned** |
| **Low** | **Accounting** | Ledger running balance performance | Introduce periodic balance snapshotting / checkpointing | Sprint 4 | **Planned** |
