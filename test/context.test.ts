import { test, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { RequestContext } from '../core/context.js';
import { eventBus, EventBus, BaseEventPayload } from '../core/events.js';

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

  it('propagates tenant context through EventBus async publish', async () => {
    let receivedTenantId: string | undefined;
    let receivedCorrelationId: string | undefined;

    const testEventBus = new EventBus();
    
    testEventBus.subscribe('test.event', (payload: BaseEventPayload & { data: string }) => {
      receivedTenantId = RequestContext.tryGet()?.tenantId;
      receivedCorrelationId = RequestContext.tryGet()?.correlationId;
    });

    await RequestContext.run(
      { tenantId: 'tenant-event-test', correlationId: 'corr-123', userId: undefined },
      async () => {
        testEventBus.publish('test.event', {
          tenantId: 'tenant-event-test',
          data: 'test-data'
        });
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(receivedTenantId, 'tenant-event-test', 'Tenant ID should be propagated through EventBus');
    assert.ok(receivedCorrelationId, 'Correlation ID should be propagated through EventBus');
  });
});

