# GarrisonOS Contributor & Engineering Guardrails

This document establishes the mandatory engineering standards, architectural constraints, and contribution rules for GarrisonOS. All human and automated contributors must strictly adhere to these rules without exception.

---

## 1. Zero External Runtime Dependencies

* **Backend Engine**: Relies solely on the Node.js standard library (`node:http`, `node:sqlite`, `node:crypto`, `node:async_hooks`, `node:events`, `node:fs`, `node:path`, `node:test`, `node:assert`). No npm packages at runtime (no Express, Fastify, Drizzle, Prisma, TypeORM, Zod, uuid, bcrypt, etc.). Only `typescript` and `@types/node` are permitted as `devDependencies`.
* **Frontend Presentation**: Relies solely on native PHP (with standard extensions: `pdo_sqlite`, `curl`, `session`, `filter`) and semantic HTML5 with vanilla CSS Custom Properties. No Composer dependencies, build pipelines, CSS preprocessors, or frontend JavaScript frameworks.

---

## 2. Code Quality & Clean Attribution

* Maintain clean, idiomatic, human-grade engineering standards.
* No conversational explanations, boilerplate disclaimers, or generic placeholder comments (e.g. `// TODO: Implement your logic here`).
* **Portable Path Hygiene**: Never hardcode host- or user-specific absolute filesystem paths (e.g., `C:\Users\...`, `/home/user/...`, `/Users/...`) in source code, automated tests, seed scripts, mock fixtures, comments, or documentation. All filesystem interactions must be strictly portable and relative, utilizing `node:path` primitives (`path.join()`, `path.resolve()`, `import.meta.url`) or standard environment configuration (`STORAGE_PATH`, `SQLITE_PATH`).
* Commit messages must strictly follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  * `feat(scope): add new capability`
  * `fix(scope): resolve issue`
  * `test(scope): add test coverage`
  * `refactor(scope): streamline implementation`

---

## 3. Strict Multi-Tenancy & Row-Level Isolation

* Every operational database table must contain a `tenant_id TEXT NOT NULL` column, referencing `tenants(id)`.
* Tenant context must be resolved from the `X-Tenant-ID` header and propagated via `AsyncLocalStorage` in `core/context.ts`.
* Business logic, repositories, and domain services must NEVER accept `tenant_id` from request bodies or URL route parameters. It must always be extracted implicitly from `RequestContext.getTenantId()` or `RequestContext.get()`.
* Every SQL query must filter on `tenant_id` and be supported by compound indexes `(tenant_id, ...)`.

---

## 4. Data Representation & Entity Standards

* **Primary Keys**: RFC 9562 UUIDv7 (time-ordered 128-bit UUID generated natively via `node:crypto.randomBytes`).
* **Financials & Currency**: Stored strictly as **INTEGER cents** (e.g., $1,250.00 is stored as `125000`). Floating-point currency math is prohibited. Ledger transactions are append-only and immutable; corrections must be recorded as explicit reversal/adjustment transactions.
* **Timestamps**: Stored strictly as **INTEGER milliseconds** (UTC epoch ms via `Date.now()`).
* **Soft Deletes**: Standardized `deleted_at INTEGER` column on all operational tables (`NULL` when active, epoch ms when deleted). All operational queries must filter `WHERE deleted_at IS NULL` by default.

---

## 5. Security & Isolation

* Passwords must be hashed using native `node:crypto.scrypt` with random 16-byte salt, formatted as `$scrypt$N=16384,r=8,p=1$salt$hash`, and verified with `node:crypto.timingSafeEqual`.
* Authentication tokens are signed HMAC-SHA256 tokens.
* All state-modifying requests from the presentation layer must validate cryptographic CSRF tokens stored in the PHP session.
* Public authentication endpoints must enforce sliding-window in-memory rate limiting.
* **Network & Loopback Binding**: The Node.js core engine must strictly bind to `127.0.0.1` (loopback) to prevent direct untrusted network exposure.
* **Zero Outbound Telemetry**: The engine operates offline-first; no unsolicited external network calls, tracking, or telemetry are permitted.
* **File Uploads & Media Storage**: Uploaded attachments must be stored outside the web root (`STORAGE_PATH`), validate explicit allowed MIME/extension whitelists, enforce byte size bounds, and validate resolved paths against directory traversal attacks (`path.resolve`).

---

## 6. Modular Architecture

* Domain features live inside self-contained modules under `modules/[module_name]/`.
* Modules must supply a `module.json` manifest and follow standard contracts for backend migrations, routes, events, repositories, frontend hooks/pages, and packaged automated tests under `modules/[module_name]/test/`.
* Whenever a new module is introduced, its associated unit and integration test suite must be co-located within the module's `test/` directory.
* Cross-module communication must use the asynchronous in-process `EventBus` (`core/events.ts`).

---

## 7. Efficient Test Execution & Verification

* **Proactive Execution Prohibition**: Never proactively run builds (`npm run build`) or test suites (`npm test`) unless runtime code was actually modified or explicitly requested by the user.
* **Documentation, Tooling & IDE Settings**: Do NOT execute builds or tests when creating/modifying documentation (`*.md`), IDE settings (`.vscode/`), CI workflows (`.github/`), static assets, or non-runtime files.
* **Modular Changes**: When modifying a single module, execute only that module's test suite: `npm run test:module <module_name>` or `node scripts/test.js <module_name>`.
* **Core Subsystems**: When modifying core primitives (`core/`, `api/`, `database/`), execute core tests via `npm run test:core`.
* **Full Regression**: Execute `npm test` only before submitting pull requests or when modifying runtime engine dependencies / core compilation configurations (`tsconfig.json`, `package.json` runtime scripts).

---

## 8. Database & Transaction Safety

* **Parameterized Queries**: Raw SQL string concatenation and template literal interpolation for variable data are strictly prohibited. All queries must use parameterized placeholders (`?` or named parameters).
* **Operational PRAGMAs**: Database connections must enforce Foreign Keys (`PRAGMA foreign_keys = ON`), Write-Ahead Logging (`PRAGMA journal_mode = WAL`), and Busy Timeout (`PRAGMA busy_timeout = 5000`).
* **Atomic Transactions & Lock Minimization**: Multi-step state mutations must execute within explicit transaction boundaries (`db.transaction(...)` / `BEGIN IMMEDIATE`) to prevent concurrency anomalies and SQLite locking contention. Keep transaction execution windows minimal.
* **Schema Evolution**: Schema modifications must be performed exclusively through standard versioned migrations; direct runtime DDL executions outside migration lifecycles are forbidden.

---

## 9. Input Validation & Type Safety

* **Native Validation**: With zero runtime validation libraries permitted, every API handler must execute explicit native validation guards (checking primitive types, field presence, integer ranges, and string lengths) before passing inputs to domain logic.
* **Strict Equality**: Always enforce strict equality (`===` / `!==`) in both TypeScript and PHP layers. Loose comparisons are prohibited.

---

## 10. Error Handling & Information Disclosure

* **Structured Errors**: Use standardized application error classes carrying explicit HTTP status codes and machine-readable error codes.
* **Information Leak Prevention**: Database driver errors, internal stack traces, and sensitive query parameter dumps must never be returned in client-facing HTTP response payloads.

---

## 11. Event Handlers & Background Tasks

* **Handler Resilience**: All listeners attached to `EventBus` (`core/events.ts`) must handle their own errors gracefully with try/catch blocks to ensure background failures do not disrupt the primary request flow.
* **Non-Blocking Operations**: Do not execute long-running CPU-bound loops or blocking synchronous operations directly inside HTTP request handlers.

---

## 12. Safe PHP Presentation & Output Encoding

* **Output Sanitization**: All dynamic values rendered in PHP templates must be strictly escaped using `htmlspecialchars($val, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')` or a designated escaping helper to eliminate XSS vectors.
* **Script & Content Isolation**: Inline dynamic scripts and unvalidated DOM injections (`innerHTML`, `eval()`) are forbidden; preserve strict Content Security Policy (CSP) compliance.



