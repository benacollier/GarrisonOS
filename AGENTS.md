# GarrisonOS Contributor & Engineering Guardrails

This document establishes the mandatory engineering standards, architectural constraints, and contribution rules for GarrisonOS. All human contributors and automated agents (GitHub Copilot, Devstral, local models, coding assistants) must strictly adhere to these rules without exception.

---

## 1. Zero External Runtime Dependencies

GarrisonOS runs exclusively on native runtimes. Do not import, install, or reference external npm or Composer packages for production execution.

### Permitted vs. Prohibited Dependency Matrix

| Domain | Allowed Standard Library | STRICTLY PROHIBITED (Do Not Import) |
| :--- | :--- | :--- |
| **HTTP Server** | `node:http` | `express`, `fastify`, `koa`, `connect` |
| **Database** | `node:sqlite` (`DatabaseSync`) | `sqlite3`, `better-sqlite3`, `drizzle-orm`, `prisma`, `typeorm` |
| **Cryptography & IDs** | `node:crypto` (`scrypt`, `randomBytes`, `timingSafeEqual`) | `uuid`, `nanoid`, `bcrypt`, `argon2`, `jsonwebtoken` |
| **Validation** | Native manual validation guards & strict equality (`===`) | `zod`, `joi`, `yup`, `validator` |
| **Configuration** | Native `process.env` & Node `--env-file` | `dotenv`, `dotenv-expand` |
| **Async Context** | `node:async_hooks` (`AsyncLocalStorage`) | Custom context managers |
| **Testing** | `node:test`, `node:assert` | `jest`, `mocha`, `chai`, `vitest`, `supertest` |
| **Frontend Presentation** | Native PHP (`pdo_sqlite`, `curl`, `session`, `filter`) | Composer packages, Laravel, Symfony, React, Vue, build bundlers |

* **Permitted devDependencies**: Only `typescript` and `@types/node` are permitted.
* **Portable Path Hygiene**: Never hardcode host- or user-specific absolute filesystem paths (e.g., `C:\Users\...`, `/home/user/...`). All paths must use `node:path` primitives (`path.join()`, `path.resolve()`) or standard environment variables (`STORAGE_PATH`, `SQLITE_PATH`).

---

## 2. Persistence, SQLite & PostgreSQL Forward Compatibility

### Engine & Database API
* **Runtime Database**: Embedded SQLite via Node.js built-in `node:sqlite.DatabaseSync`.
* **Synchronous API Guardrail**: `node:sqlite.DatabaseSync` is **synchronous**. Never write `await db.prepare(...)`, `await db.exec(...)`, or promise-based queries.
* Database connections must enforce operational PRAGMAs (see `database/client.ts`):
  ```sql
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
  ```
* Multi-step state mutations must execute within explicit transaction boundaries via `withTransaction(fn)` or `BEGIN IMMEDIATE`.
* **Parameterized Queries**: Raw SQL string concatenation and template literal variable interpolation are strictly prohibited. Every query must use parameterized placeholders (`?`).

### MANDATORY: PostgreSQL Forward Compatibility & Portable SQL
While GarrisonOS runs on an embedded SQLite engine for zero-dependency local execution, **all database schemas, migrations, queries, and DDL MUST be strictly forward-compatible with PostgreSQL**. The system is architected to allow dropping in a native PostgreSQL driver in the future without modifying domain queries or migration history.

Automated agents and contributors must observe these cross-dialect portability rules:

| Rule Area | Compliant (Portable & PostgreSQL-Compatible) | FORBIDDEN (SQLite-Only / Non-Portable) |
| :--- | :--- | :--- |
| **Primary Keys** | `id TEXT PRIMARY KEY` (UUIDv7 string) | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| **String Literals** | Standard ANSI single quotes: `'active'` | Double quotes (`"active"`) or backticks (`` `active` ``) |
| **Upserts** | ANSI standard: `ON CONFLICT (...) DO UPDATE / DO NOTHING` | `INSERT OR REPLACE`, `INSERT OR IGNORE` |
| **Date & Time** | UTC epoch milliseconds: `INTEGER` (via `Date.now()`) | `datetime('now')`, `strftime(...)`, `unixepoch()` |
| **Type Rigor** | Strictly adhere to declared types (`TEXT`, `INTEGER`) | Storing text in numeric columns (SQLite dynamic affinity bypass) |
| **Booleans** | `INTEGER NOT NULL DEFAULT 0 CHECK (col IN (0, 1))` | Unconstrained integers or dialect-specific boolean keywords |
| **JSON Fields** | Stored as `TEXT`; parsed/serialized in application layer | Native dialect-specific JSON query functions |
| **Partial Indexes** | ANSI partial index syntax: `WHERE deleted_at IS NULL` | Non-standard index expressions |

### Row-Level Multi-Tenancy
* Every operational database table must contain a `tenant_id TEXT NOT NULL REFERENCES tenants(id)`.
* Compound indexes supporting queries must lead with `tenant_id` (e.g., `CREATE INDEX idx_orders_tenant_created ON orders(tenant_id, created_at);`).
* **Zero Parameter Leakage**: Business logic, repositories, and routes must **NEVER** accept `tenant_id` from client request bodies, query parameters, or URL route parameters.
* Always extract tenant context implicitly from `RequestContext.getTenantId()` (see `core/context.ts`):
  ```typescript
  // CORRECT:
  const tenantId = RequestContext.getTenantId();
  const stmt = db.prepare('SELECT * FROM properties WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL');
  const property = stmt.get(tenantId, propertyId);

  // FORBIDDEN:
  // app.get('/api/properties/:tenant_id') <-- NEVER put tenant_id in routes or request payloads
  ```

### Data Representation Standards
* **Primary Keys**: RFC 9562 UUIDv7 strings generated natively via `node:crypto.randomBytes`. Always import `generateUUIDv7` from `core/crypto.ts`.
* **Financial Amounts**: Stored strictly as **INTEGER cents** (e.g., $1,250.00 is stored as `125000`). Floating-point currency math is prohibited. Ledger transactions are append-only and immutable.
* **Timestamps**: Stored strictly as **INTEGER milliseconds** (UTC epoch ms via `Date.now()`).
* **Soft Deletes**: Standardized `deleted_at INTEGER` column on all operational tables (`NULL` when active, epoch ms when deleted). All operational queries must filter `WHERE deleted_at IS NULL` by default.

### Schema Migrations
* Migrations reside in `modules/<module_name>/backend/migrations/` (or `database/migrations/` for core) and are named sequentially: `0001_<description>.sql`, `0002_<description>.sql`.
* All schema evolution must be **additive and backward-compatible** (new tables or nullable columns only). Renaming, removing, or altering the types of existing columns is prohibited without a documented backward-compatible migration path.

---

## 3. Modular Architecture & REST API Contracts

### Module Isolation
* Domain features live inside self-contained modules under `modules/<module_name>/` with dedicated `backend/`, `frontend/`, and `test/` subdirectories.
* Every module must provide a `module.json` manifest defining its metadata, routes, permissions, and dependencies.
* **Zero Cross-Module Direct Imports**: Modules must never import directly from another module's internal implementation files.
* **Cross-Module Communication**: Must use the asynchronous in-process `EventBus` (`core/events.ts`).
* **Handler Resilience**: All `EventBus` listeners must wrap their execution in `try/catch` blocks to ensure background failures do not crash the process or interrupt the request flow.

### Standardized REST API Envelopes
All API endpoints must return structured JSON envelopes conforming to `api/response.ts`:

```typescript
// Single entity or operation success (HTTP 200/201):
{
  "success": true,
  "data": { "id": "018f...", "name": "Sunset Apartments" }
}

// Paginated collection success (HTTP 200):
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 50
  }
}

// Error response (HTTP 4xx/5xx):
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Monthly rent must be a positive integer in cents",
    "details": [ ... ]
  }
}
```

* Use `successResponse(res, data, statusCode, meta)` and `errorResponse(res, code, message, statusCode)` from `api/response.ts`.
* Internal database driver errors, SQL statements, and stack traces must **NEVER** be leaked in HTTP responses.
* Enforce **strict equality** (`===` / `!==`) across all TypeScript and PHP code. Loose equality is prohibited.

---

## 4. Security & PHP Presentation

### Cryptography & Engine Isolation
* **Password Hashing**: Native `node:crypto.scrypt` with a random 16-byte salt, formatted as `$scrypt$N=16384,r=8,p=1$salt$hash`. Verification must use `node:crypto.timingSafeEqual` (use `hashPassword` and `verifyPassword` from `core/crypto.ts`).
* **Auth Tokens**: Signed HMAC-SHA256 tokens using native `node:crypto` (use `createToken` and `verifyToken` from `core/crypto.ts`).
* **Network & Loopback Binding**: The Node.js engine must bind strictly to `127.0.0.1` (loopback). Direct untrusted external network exposure is forbidden.
* **Zero Outbound Telemetry**: The engine operates offline-first. No unsolicited external network calls, tracking, or remote telemetry are permitted.
* **File Uploads & Media Storage**: Uploaded files must be stored outside the web root (`STORAGE_PATH`), validate explicit allowed MIME/extension whitelists, enforce byte size limits, and validate resolved paths against directory traversal attacks via `path.resolve()`.

### Safe PHP Presentation
* **XSS Prevention**: All dynamic values rendered in PHP templates must be strictly escaped:
  ```php
  <?= htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
  ```
* **CSRF Protection**: All state-modifying requests (POST, PUT, DELETE) from the presentation layer must validate a cryptographic CSRF token stored in the PHP session.
* **Strict CSP**: Inline dynamic scripts and unvalidated DOM injections (`innerHTML`, `eval()`) are forbidden.

---

## 5. Contributor Workflow, Testing & Attribution

### Windows Terminal Execution Guardrail
When running terminal commands on Windows host environments:
* **NEVER** invoke bare `npm` or `npx` (causes `PSSecurityException` on `npm.ps1`).
* **ALWAYS** execute `npm.cmd`, `npx.cmd`, or `node <script>`:
  ```powershell
  # CORRECT:
  node scripts/test.js
  npm.cmd test
  npm.cmd run build

  # FORBIDDEN (Will fail on Windows):
  # npm test
  # npx tsc
  ```

### Targeted Test Execution
* **No Proactive Runs**: Do not proactively execute builds or test suites when modifying documentation (`*.md`), IDE settings, CI workflows, or static assets.
* **Single Module Changes**: Run only that module's test suite:
  ```powershell
  node scripts/test.js <module_name>
  # or: npm.cmd run test:module <module_name>
  ```
* **Core Subsystem Changes**: When modifying `core/`, `api/`, or `database/`, execute core tests:
  ```powershell
  node scripts/test.js core
  ```
* **Full Regression**: Execute full regression (`node scripts/test.js` or `npm.cmd test`) only before submitting a pull request or when modifying root compilation configurations.
* **Co-located Tests**: Every new module or capability must include automated tests co-located under `modules/<module_name>/test/` achieving full coverage of its public APIs.

### Attribution, Commits & Documentation Hygiene
* **No Agent or AI Attribution**: Contributors and automated agents must **NEVER** reference themselves or identify AI/LLM involvement anywhere in the repository (no "Generated by", no agent names, no LLM co-authors or provenance comments).
* **100% Docstring Coverage**: Every exported function, interface, class, method, module, and PHP public API must include complete docstrings (TSDoc/PHPDoc).
* **Conventional Commits**: Commit messages must follow the Conventional Commits specification with concise 50–72 character summaries:
  * `feat(scope): add new capability`
  * `fix(scope): resolve issue`
  * `test(scope): add test coverage`
  * `refactor(scope): streamline implementation`
* **Atomic Commits**: Keep commits focused and granular. Do not bundle unrelated features, refactors, or documentation into a single commit.
* **Code-Documentation Atomicity**: Any change to source code, schemas, APIs, module manifests, or configuration must be accompanied by corresponding updates to documentation under `docs/` and `CHANGELOG.md` within the same pull request.

