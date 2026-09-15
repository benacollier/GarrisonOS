# Testing & Quality Assurance

GarrisonOS adheres to a zero-dependency testing strategy using Node.js built-in `node:test` runner and `node:assert` module.

---

## 1. Running the Test Suite

```bash
# Build TypeScript artifacts and run all test suites
npm test
```

This runs:
* **Core Subsystem Tests** (`test/`): `crypto.test.ts`, `context.test.ts`, `isolation.test.ts`, `router.test.ts`, `modules.test.ts`.
* **Module-Packaged Domain Tests** (`modules/*/test/`):
  * `modules/properties/test/properties.test.ts`
  * `modules/contacts/test/contacts.test.ts`
  * `modules/leases/test/leases.test.ts`
  * `modules/accounting/test/` (`billing.test.ts`, `ledger.test.ts`, `accounting.test.ts`)
  * `modules/maintenance/test/maintenance.test.ts`

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
