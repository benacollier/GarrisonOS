import { test, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { RequestContext } from '../core/context.js';
import { eventBus, EventBus, BaseEventPayload } from '../core/events.js';

describe('RequestContext & Multi-Operator Store Subsystem', () => {
  it('propagates operator context synchronously', () => {
    RequestContext.run({ operatorId: 'operator-100', correlationId: 'req-1' }, () => {
      assert.equal(RequestContext.getOperatorId(), 'operator-100');
      assert.equal(RequestContext.getTenantId(), 'operator-100');
      assert.equal(RequestContext.getCorrelationId(), 'req-1');
    });
  });

  it('supports legacy tenantId fallback synchronously', () => {
    RequestContext.run({ tenantId: 'tenant-100', correlationId: 'req-1' }, () => {
      assert.equal(RequestContext.getOperatorId(), 'tenant-100');
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
    const eventHandled = new Promise<void>((resolve) => {
      testEventBus.subscribe('test.event', (payload: BaseEventPayload & { data: string }) => {
        receivedTenantId = RequestContext.tryGet()?.tenantId;
        receivedCorrelationId = RequestContext.tryGet()?.correlationId;
        resolve();
      });
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

    await eventHandled;

    assert.equal(receivedTenantId, 'tenant-event-test', 'Tenant ID should be propagated through EventBus');
    assert.ok(receivedCorrelationId, 'Correlation ID should be propagated through EventBus');
  });

  it('propagates active RequestContext when payload omits tenantId', async () => {
    let receivedTenantId: string | undefined;
    let receivedCorrelationId: string | undefined;
    let receivedUserId: string | undefined;

    const testEventBus = new EventBus();
    const eventHandled = new Promise<void>((resolve) => {
      testEventBus.subscribe('test.no_tenant', (payload: any) => {
        receivedTenantId = RequestContext.tryGet()?.tenantId;
        receivedCorrelationId = RequestContext.tryGet()?.correlationId;
        receivedUserId = RequestContext.tryGet()?.userId;
        resolve();
      });
    });

    await RequestContext.run(
      { tenantId: 'tenant-inherited', correlationId: 'corr-inherited', userId: 'user-inherited' },
      async () => {
        testEventBus.publish('test.no_tenant', {
          data: 'test-data-without-explicit-tenant'
        });
      }
    );

    await eventHandled;

    assert.equal(receivedTenantId, 'tenant-inherited');
    assert.equal(receivedCorrelationId, 'corr-inherited');
    assert.equal(receivedUserId, 'user-inherited');
  });
});

