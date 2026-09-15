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
* Commit messages must strictly follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  * `feat(scope): add new capability`
  * `fix(scope): resolve issue`
  * `test(scope): add test coverage`
  * `refactor(scope): streamline implementation`

---

## 3. Strict Multi-Tenancy & Row-Level Isolation

* Every operational database table must contain a `tenant_id TEXT NOT NULL` column, referencing `tenants(id)`.
* Tenant context must be resolved from the `X-Tenant-ID` header and propagated via `AsyncLocalStorage` in `core/context.ts`.
* Business logic, repositories, and domain services must NEVER accept `tenant_id` from request bodies or URL route parameters. It must always be extracted implicitly from `RequestContext.get()`.
* Every SQL query must filter on `tenant_id` and be supported by compound indexes `(tenant_id, ...)`.

---

## 4. Data Representation & Entity Standards

* **Primary Keys**: RFC 9562 UUIDv7 (time-ordered 128-bit UUID generated natively via `node:crypto.randomBytes`).
* **Financials & Currency**: Stored strictly as **INTEGER cents** (e.g., $1,250.00 is stored as `125000`). Floating-point currency math is prohibited.
* **Timestamps**: Stored strictly as **INTEGER milliseconds** (UTC epoch ms via `Date.now()`).
* **Soft Deletes**: Standardized `deleted_at INTEGER` column on all operational tables (`NULL` when active, epoch ms when deleted).

---

## 5. Security & Isolation

* Passwords must be hashed using native `node:crypto.scrypt` with random 16-byte salt, formatted as `$scrypt$N=16384,r=8,p=1$salt$hash`, and verified with `node:crypto.timingSafeEqual`.
* Authentication tokens are signed HMAC-SHA256 tokens.
* All state-modifying requests from the presentation layer must validate cryptographic CSRF tokens stored in the PHP session.
* Public authentication endpoints must enforce sliding-window in-memory rate limiting.

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


