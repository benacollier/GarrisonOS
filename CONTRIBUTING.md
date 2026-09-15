# Contributing to GarrisonOS

Thank you for your interest in contributing to **GarrisonOS**! We welcome community contributions to build the premier zero-dependency, open-source property management platform.

Please review this guide before submitting issues or Pull Requests.

---

## 1. Contributor License Agreement (CLA) & Dual Licensing

To ensure that GarrisonOS remains legally protected and sustainable, all contributors must sign our [Contributor License Agreement (CLA)](docs/legal/CLA.md) before their contributions can be merged.

### Why do we require a CLA?
GarrisonOS operates under an open-source model licensed under the **GNU Affero General Public License v3 (AGPLv3)** with a Section 7 UI attribution requirement. To sustainably support and fund ongoing open-source engineering, the project utilizes a **dual-licensing / commercial licensing model**. 

Under our CLA:
1. **You keep ownership** of your contributions.
2. You grant the project a perpetual, royalty-free license to distribute your code under the AGPLv3 open-source license as well as commercial/proprietary editions.

### Automated CLA Check
When you open a Pull Request, an automated **CLA Assistant** GitHub Action will check whether your GitHub account has signed the agreement. If you have not yet signed, the bot will post a comment on your PR with a link and simple instructions to agree in one click.

---

## 2. Engineering Standards & Architecture Guardrails

All contributions must strictly adhere to the project's non-negotiable architectural principles:

1. **Zero External Runtime Dependencies**:
   - **Backend**: Only standard Node.js built-ins (`node:http`, `node:sqlite`, `node:crypto`, `node:async_hooks`, `node:events`, `node:fs`, `node:path`, `node:test`, `node:assert`). No npm packages at runtime. Only `@types/node` and `typescript` as build-time dev dependencies.
   - **Frontend**: Native PHP with standard extensions (`pdo_sqlite`, `curl`, `session`, `filter`) and semantic HTML5 with vanilla CSS Custom Properties. No Composer packages, Tailwind/Vite build steps, or JavaScript frameworks.
2. **Strict Multi-Tenancy**:
   - Every operational database table must include `tenant_id TEXT NOT NULL`.
   - Business logic must never accept `tenant_id` from request parameters; it must always be resolved implicitly from `RequestContext` via `AsyncLocalStorage`.
3. **Data & Identity Standards**:
   - Primary keys must be RFC 9562 **UUIDv7**.
   - Currency values must be stored strictly as **INTEGER cents**.
   - Timestamps must be stored as **INTEGER milliseconds** (UTC epoch).
   - Use `deleted_at INTEGER` for soft deletes.
4. **Code Quality & Commit Conventions**:
   - Write clean, idiomatic, human-grade code without generic boilerplate, placeholder comments, or conversational text.
   - Follow Conventional Commits format (e.g., `feat(properties): add unit status filter`, `fix(accounting): correct delinquency grace period calculation`).

---

## 3. Development Workflow

### Prerequisites
* **Node.js**: v22.5.0 or newer (Node v24 LTS recommended)
* **PHP**: 8.2 or newer (with `pdo_sqlite`, `curl`, and `session` enabled)

### Local Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/garrisonos/garrison-os.git
   cd garrison-os
   ```
2. Install compile-time dependencies:
   ```bash
   npm install
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Build TypeScript and run migrations:
   ```bash
   npm run build
   npm run migrate
   ```
5. Seed demo data (optional):
   ```bash
   npm run seed
   ```
6. Start development servers:
   ```bash
   # Terminal 1: Node.js API engine
   npm run dev

   # Terminal 2: PHP frontend
   php -S localhost:80 -t web web/index.php
   ```

---

## 4. Testing Requirements

All PRs introducing new modules, features, or bug fixes must include corresponding tests using the native Node.js test runner (`node:test` and `node:assert`):
* **Core Subsystem Tests**: Co-located in `test/` for core primitives, routers, crypto, and multi-tenant context.
* **Module-Packaged Tests**: Co-located within the module's `modules/[module_name]/test/` directory for repositories, routes, events, and business workflows.

```bash
# Run the full automated test suite (executes core and all module tests)
npm test
```

Tests must pass with zero failures and maintain 100% tenant isolation. All modules must package at least one automated test suite.

---

## 5. Submitting a Pull Request

1. Create a feature branch from `main` (`git checkout -b feat/my-new-feature`).
2. Implement your changes following all architectural guardrails.
3. Verify type correctness: `npm run build`.
4. Ensure all automated tests pass: `npm test`.
5. Commit your changes using conventional commit messages.
6. Push to your fork and submit a Pull Request to `main`.
7. Sign the automated CLA when prompted by the CLA bot.

