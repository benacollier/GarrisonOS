# Testing & Quality Assurance

GarrisonOS adheres to a zero-dependency testing strategy using Node.js built-in `node:test` runner and `node:assert` module.

---

## 1. Running the Test Suite

```bash
# Run all test suites across core and modules
npm test

# Run only core subsystem tests
npm run test:core

# Run a specific module's test suite dynamically (e.g. properties, accounting, or any new module)
npm run test:module properties
```

This supports:

* **Core Subsystem Tests** (`test/`): `crypto.test.ts`, `context.test.ts`, `isolation.test.ts`, `router.test.ts`, `modules.test.ts`.
* **Module-Packaged Domain Tests** (`modules/<module_name>/test/`): Automatically discovered and executed on demand for existing and newly created modules.

---

## 2. Writing Unit & Integration Tests

### Example Module Test Structure

```typescript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RequestContext } from '../../../core/context.js';
import { createTestDatabase } from '../../../test/helpers.js';

describe('Properties Module - Lifecycle & Inventory Management', () => {
  beforeEach(() => {
    createTestDatabase();
  });

  it('manages property and unit lifecycle under active tenant', async () => {
    await RequestContext.run({ tenantId: 'test-tenant-1', correlationId: 'test-corr-1' }, async () => {
      // Test business logic and repository assertions
      assert.ok(true);
    });
  });
});
```

---

## 3. Test Invariants

1. **Context Isolation**: Every test must execute within an explicit `RequestContext.run()` wrapper to simulate isolated request execution.
2. **Deterministic Time**: Tests must use fixed or relative timestamp offsets to avoid flaky assertions.
3. **Zero Test Framework Dependencies**: Do not introduce Jest, Mocha, Chai, Vitest, or Sinon. Use standard Node.js built-ins.

---

## 4. Secret Scanning & Repository Hygiene

To safeguard against accidental credential exposure and host-specific path leaks, all contributions must pass hygiene and secret scanning:

```bash
# Run repository hygiene and path leak checks
npm run check:hygiene
```

* **Betterleaks Secret Scanning**: Executed on CI (`.github/workflows/security.yml`) across all commits and pull requests.
* **Baseline Exceptions**: Synthetic test credentials or cryptographic test vectors in `test/` that trigger false positives must be baselined in [`.betterleaksignore`](../../.betterleaksignore).
