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

### Identified Risks & Limitations

* **Asynchronous Context Loss in Event Subscribers**: `EventBus.publish()` dispatches events on the next event loop tick via `setImmediate()`. Consequently, the active `AsyncLocalStorage` store is detached from subscriber callbacks. If a subscriber executes repository queries without explicitly re-wrapping the execution in `RequestContext.run()`, the runtime throws an uncaught context error (`No active request context found in execution store`).
* **Coupled Middleware Public Route Registry**: In `api/middleware.ts`, public endpoints (`/health`, `/ready`, `/api/v1/auth/*`, `/api/v1/system/backup`) are hardcoded directly into the tenant resolution middleware. Modules cannot declare public or webhook endpoints independently without modifying core middleware.

### Recommendations

1. Enhance `EventBus.subscribe()` to automatically detect tenant-scoped payloads (e.g. payloads implementing `{ tenantId: string }`) and auto-wrap callback execution in `RequestContext.run()`.
2. Allow route registration to specify metadata flags (e.g., `router.get(path, { isPublic: true }, ...handlers)`) to decouple endpoint access control from global middleware logic.

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

## 4. Polyglot Architecture & Presentation Layer Efficiency

### Current State

* Headless TypeScript backend engine (`node:http`, `node:sqlite`).
* Server-rendered frontend presentation layer built in native PHP 8.2+ with semantic HTML5 and vanilla CSS custom properties.
* Presentation layer communicates with the backend exclusively via HTTP/cURL loopback requests (`web/lib/api.php`).

### Identified Risks & Limitations

* **Dual-Runtime Operational Complexity**: Deploying GarrisonOS requires provisioning and supervising two runtime environments (Node.js 22+ and PHP 8.2+ with standard extensions `curl`, `pdo_sqlite`, `session`), requiring a process manager (e.g., systemd, supervisord, or multi-container Docker compose).
* **Sequential Loopback Latency on Composite Views**: On composite pages (such as the main KPI dashboard rendered via `web/lib/hooks.php`), multiple module card callbacks fire sequentially. Each executes an independent cURL HTTP request against `127.0.0.1:3000`, multiplying request overhead and increasing Time to First Byte (TTFB).

### Recommendations

1. Provide a standard multi-container `docker-compose.yml` and unified production containerfile.
2. Continue extending the batch endpoint (`POST /api/v1/batch`) as new dashboard data requirements emerge.

---

## 5. Financial Ledger & Trust Accounting

### Current State

* Single-entry cash-basis ledger stored in `transactions` with integer cents precision.
* Tax categorization directly aligned with IRS Schedule E expense lines.
* Automated recurring rent generation with mid-month proration and idempotency keys (`rent_charge:{lease_id}:{YYYY_MM}`).
* Double-entry General Ledger translation through customizable Chart of Accounts (`chart_of_accounts`), supporting export to QuickBooks Online (CSV), QuickBooks Desktop (IIF), and Web Connect (.QBO).

### Identified Risks & Limitations

* **Security Deposit Trust Liability vs. Operating Funds**: Single-entry ledger tracking combines operating revenue and tenant security deposit trust liabilities within the same transaction table. The QuickBooks integration maps these to dedicated accounts (1010 Operating Checking vs 1020 Trust Checking, and 2100 Tenant Security Deposits Held), but statutory trust banking reconciliation reports remain an ongoing enhancement.
* **Running Balance Performance**: Tenant running balances are calculated on-the-fly by aggregating all historical transactions for a given lease. While performant for small unit portfolios (<50 units), large transaction histories will require periodic snapshotting or indexed materialization.

### Recommendations

1. Provide automated trust bank account reconciliation reports comparing ledger deposit balances with bank balances.
2. Introduce balance caching or periodic ledger checkpointing for long-running tenancies.

---

## 6. Security, Authentication & Session Hygiene

### Current State

* Password hashing using native `node:crypto.scrypt` with random 16-byte salt and constant-time verification (`timingSafeEqual`).
* Stateless HMAC-SHA256 session tokens.
* CSRF validation for all state-modifying requests in the PHP layer.
* Sliding-window in-memory rate limiting on authentication routes.

### Identified Risks & Limitations

* **Legacy Token Invalidation**: New session tokens include a `token_version` claim and database-backed verification rejects mismatched versions or deleted users. Legacy tokens without a `tv` claim remain accepted for compatibility and cannot be revoked through the version check.
* **Default Secret Fallbacks**: Non-development server startup now requires an explicit `APP_SECRET`.

### Recommendations

1. Decide when to remove support for legacy tokens without `tv`; after a documented compatibility window, reject them so every token is revocable through `token_version`.
2. Keep deployment checks and environment documentation aligned with the explicit `APP_SECRET` startup requirement.

---

## 7. Action Plan & Prioritized Matrix

| Priority | Subsystem | Issue | Action Item |
| :--- | :--- | :--- | :--- |
| **High** | **Context & Events** | Context loss in async event handlers | Auto-propagate `RequestContext` in `EventBus.subscribe()` |
| **High** | **Database Migrator** | Alphabetical migration execution | Topological sort migrations by `dependencies` in `module.json` |
| **Medium** | **HTTP Router** | Linear regex matching order sensitivity | Introduce static-first segment precedence in route dispatcher |
| **Medium** | **Security** | Legacy HMAC tokens without `tv` cannot be revoked | Define and document a compatibility window before rejecting legacy tokens |
| **Medium** | **Frontend API** | Sequential cURL overhead on composite pages | Provide composite/batch API endpoint for dashboard hydration |
| **Low** | **Accounting** | Statutory trust reconciliation reporting | Add dedicated escrow/trust statutory compliance reports |
