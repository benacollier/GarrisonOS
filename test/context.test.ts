import { test, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { RequestContext } from '../core/context.js';

describe('RequestContext & Multi-Tenant Store Subsystem', () => {
  it('propagates tenant context synchronously', () => {
    RequestContext.run({ tenantId: 'tenant-100', correlationId: 'req-1' }, () => {
      assert.equal(RequestContext.getTenantId(), 'tenant-100');
      assert.equal(RequestContext.getCorrelationId(), 'req-1');
    });
  });

  it('throws error when accessed outside active request context', () => {
    assert.throws(() => {
      RequestContext.get();
    }, /No active request context/);
  });

  it('maintains strict context isolation across concurrent asynchronous operations', async () => {
    const runTask = async (tenantId: string, delayMs: number): Promise<string> => {
      return RequestContext.run({ tenantId, correlationId: `req-${tenantId}` }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return RequestContext.getTenantId();
      });
    };

    const results = await Promise.all([
      runTask('tenant-A', 50),
      runTask('tenant-B', 20),
      runTask('tenant-C', 35),
      runTask('tenant-D', 10)
    ]);

    assert.deepEqual(results, ['tenant-A', 'tenant-B', 'tenant-C', 'tenant-D']);
  });
});

