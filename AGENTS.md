# GarrisonOS Contributor & Engineering Guardrails

This document establishes the mandatory engineering standards, architectural constraints, and contribution rules for GarrisonOS. All human and automated contributors must strictly adhere to these rules without exception.

---

## 1. Zero External Runtime Dependencies

* **SQLite/PostgreSQL Compatibility**: All database-related code, schema changes, queries, migrations, and operational behavior **MUST** remain compatible with both SQLite and PostgreSQL, regardless of which database is actively used by the project. Database-specific features **MUST NOT** be introduced unless equivalent behavior is implemented and verified for both systems.
* **Backend Engine**: Relies solely on the Node.js standard library (`node:http`, `node:sqlite`, `node:crypto`, `node:async_hooks`, `node:events`, `node:fs`, `node:path`, `node:test`, `node:assert`). No npm packages at runtime (no Express, Fastify, Drizzle, Prisma, TypeORM, Zod, uuid, bcrypt, etc.). Only `typescript` and `@types/node` are permitted as `devDependencies`.
* **Frontend Presentation**: Relies solely on native PHP (with standard extensions: `pdo_sqlite`, `curl`, `session`, `filter`) and semantic HTML5 with vanilla CSS Custom Properties. No Composer dependencies, build pipelines, CSS preprocessors, or frontend JavaScript frameworks.

---

## 2. Code Quality & Clean Attribution

* Maintain clean, idiomatic, human-grade engineering standards.
* **Design with contracts.** Use contracts to document and verify that code does no more and no less than it claims to do.
* **No agent or AI attribution:** Agents MUST NOT reference themselves or identify AI/LLM involvement anywhere in the repository, including as co-authors, contributors, reviewers, authors, or any other capacity. Repository contents MUST contain no LLM indicators, generated-by notices, model names, agent identities, or equivalent provenance markers.
* No conversational explanations, boilerplate disclaimers, or generic placeholder comments (e.g. `// TODO: Implement your logic here`).
* **100% Docstring Coverage**: Every exported function, class, method, module, and public API surface must include complete docstrings or equivalent API documentation comments (for example TSDoc/JSDoc for TypeScript and PHPDoc for PHP). Undocumented public symbols are non-compliant and must be corrected before merge.
* **Markdown Linting**: Always markdown lint edits containing markdown.
* **Portable Path Hygiene**: Never hardcode host- or user-specific absolute filesystem paths (e.g., `C:\Users\...`, `/home/user/...`, `/Users/...`) in source code, automated tests, seed scripts, mock fixtures, comments, or documentation. All filesystem interactions must be strictly portable and relative, utilizing `node:path` primitives (`path.join()`, `path.resolve()`, `import.meta.url`) or standard environment configuration (`STORAGE_PATH`, `SQLITE_PATH`).
* Commit messages must strictly follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  * `feat(scope): add new capability`
  * `fix(scope): resolve issue`
  * `test(scope): add test coverage`
  * `refactor(scope): streamline implementation`
* **Atomic & Granular Commits**: Keep commits focused and atomic. Avoid bundling multiple unrelated features, refactors, fixes, or documentation edits into a single massive commit. Separate distinct logical units into discrete commits with concise, single-line summaries (50–72 characters) and minimal, high-signal descriptions.
* **Pull Request Template & Walkthrough Requirement**: When submitting pull requests, automated agents and contributors must strictly adhere to the repository PR template (`.github/PULL_REQUEST_TEMPLATE.md`). PR descriptions and walkthroughs must remain concise, bulleted, and focused:
  * A concise **Walkthrough / Changes Summary** outlining modified components and behaviors without overly verbose or duplicated prose.
  * A brief **Verification / Testing Evidence** section recording exact test commands executed and results observed.
  * All items in the **Contributor Checklist** verified and checked off.

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

* Domain features **MUST** live inside self-contained, loosely coupled modules under `modules/[module_name]/`. Each module **SHALL** expose well-defined, stable interfaces and **MUST NOT** create tight coupling with other modules.
* Modules **MUST** supply a `module.json` manifest and follow standard contracts for backend migrations, routes, events, repositories, frontend hooks/pages, and packaged automated tests under `modules/[module_name]/test/`.
* Whenever a new module is introduced, its associated unit and integration test suite **MUST** be co-located within the module's `test/` directory and **MUST** achieve full coverage of all public APIs before merge.
* Cross-module communication **MUST** use the asynchronous in-process `EventBus` (`core/events.ts`). Direct module-to-module imports **ARE PROHIBITED** except through explicitly defined public interfaces.
* Modules **MUST** be independently replaceable, testable, and deployable. Module boundaries **SHALL** be enforced through interface contracts, not implementation sharing.

---

## 7. Efficient Test Execution & Verification

* **Windows Terminal Execution Guardrail**: When running terminal commands on Windows host environments, NEVER invoke bare `npm` or `npx`. ALWAYS execute `npm.cmd`, `npx.cmd`, or invoke `node <script>` directly (e.g. `node scripts/test.js`, `npm.cmd test`, `npm.cmd run build`) to prevent PowerShell script execution policy errors (`PSSecurityException` on `npm.ps1`).
* **Proactive Execution Prohibition**: Never proactively run builds (`npm.cmd run build`) or test suites (`node scripts/test.js`) unless runtime code was actually modified or explicitly requested by the user.
* **Documentation, Tooling & IDE Settings**: Do NOT execute builds or tests when creating/modifying documentation (`*.md`), IDE settings (`.vscode/`), CI workflows (`.github/`), static assets, or non-runtime files.
* **Modular Changes**: When modifying a single module, execute only that module's test suite: `node scripts/test.js <module_name>` or `npm.cmd run test:module <module_name>`.
* **Core Subsystems**: When modifying core primitives (`core/`, `api/`, `database/`), execute core tests via `node scripts/test.js core`.
* **Full Regression**: Execute `node scripts/test.js` (or `npm.cmd test`) only before submitting pull requests or when modifying runtime engine dependencies / core compilation configurations (`tsconfig.json`, `package.json` runtime scripts).

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

---

## 13. Forward Compatibility & Versioning

* **MANDATORY Forward Compatibility**: All public APIs, data schemas, and module interfaces **MUST** be designed to accommodate future evolution without breaking existing consumers. Breaking changes to public contracts **ARE PROHIBITED** without a major version increment and a documented deprecation cycle.
* **Additive Changes First**: New functionality **MUST** be introduced additively where possible (new endpoints, new optional fields, new modules) rather than through modifications to existing contracts. Existing fields, endpoints, and interfaces **SHALL NOT** be altered or removed without deprecation.
* **Deprecation Policy**: Deprecated APIs, endpoints, or schema elements **MUST** emit runtime warnings via standard logging channels and **MUST** continue to function for a minimum of one major version cycle or twelve months, whichever is longer. Deprecation **MUST** be announced in CHANGELOG.md with migration guidance.
* **Schema Evolution**: Database schema changes **MUST** be backward-compatible. Adding nullable columns or new tables **IS PERMITTED**; renaming, removing, or changing the type of existing columns **IS PROHIBITED** without a migration path that preserves existing data. All schema changes **MUST** be versioned through the migration system.
* **Interface Stability**: Public TypeScript interfaces, PHP class contracts, REST API endpoints, and EventBus topics **MUST** maintain stable signatures. Removing or renaming public symbols **IS PROHIBITED** without a major version bump. Internal/private symbols may change freely.
* **Configuration Forward Compatibility**: Environment variables and configuration options **MUST** be forward-compatible. New configuration keys may be added, but existing keys **MUST NOT** be removed or have their semantics changed without a major version increment and documented migration path.

---

## 14. Documentation Maintenance & Synchronization

* **MANDATORY Documentation Updates**: Documentation **MUST** be updated in the same commit or pull request as the corresponding code or configuration change. It is **NEVER ACCEPTABLE** to merge code changes without synchronously updating all relevant documentation.
* **Code-Documentation Atomicity**: Any change to source code, database schemas, API contracts, module manifests, configuration options, or architectural decisions **MUST** be accompanied by corresponding updates to all affected documentation files. This includes but is not limited to:
  * Module documentation under `docs/modules/`
  * API documentation under `docs/api/`
  * Architecture documentation under `docs/architecture/`
  * Configuration references under `docs/deployment/`
  * Inline code documentation (TSDoc, JSDoc, PHPDoc)
  * README files and module manifests
* **Documentation Review**: All documentation changes **MUST** undergo the same rigorous review process as code changes. Documentation pull requests **MUST** adhere to the PR template and include verification evidence.
* **Documentation-First for New Features**: Before implementing any new feature, module, or public API, the corresponding documentation **MUST** be drafted and reviewed. Documentation **SHALL NOT** be treated as an afterthought.
* **Documentation Audits**: When modifying or removing any code, module, configuration, or architectural component, contributors **MUST** audit the entire documentation corpus for references to the changed item and update or remove them accordingly. Dead links, outdated examples, and stale references **ARE PROHIBITED**.
* **Changelog Requirement**: Every merge to the main branch that affects user-facing behavior, public APIs, configuration, or deployment requirements **MUST** include an entry in CHANGELOG.md describing the change, its impact, and any migration steps required.
* **Markdown Standard**: All documentation **MUST** be valid, well-formed Markdown. Documentation **MUST** be markdown-linted as part of the CI process.
