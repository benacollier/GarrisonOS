import { test, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { RequestContext } from '../core/context.js';
import { eventBus, EventBus, BaseEventPayload } from '../core/events.js';

describe('RequestContext & Multi-Operator Store Subsystem', () => {
  it('propagates operator context synchronously', () => {
    RequestContext.run({ operatorId: 'operator-100', correlationId: 'req-1' }, () => {
      assert.equal(RequestContext.getOperatorId(), 'operator-100');
      assert.equal(RequestContext.getCorrelationId(), 'req-1');
    });
  });

  it('throws error when accessed outside active request context', () => {
    assert.throws(() => {
      RequestContext.get();
    }, /No active request context/);
  });

  it('maintains strict context isolation across concurrent asynchronous operations', async () => {
    const runTask = async (operatorId: string, delayMs: number): Promise<string> => {
      return RequestContext.run({ operatorId, correlationId: `req-${operatorId}` }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return RequestContext.getOperatorId();
      });
    };

    const results = await Promise.all([
      runTask('operator-A', 50),
      runTask('operator-B', 20),
      runTask('operator-C', 35),
      runTask('operator-D', 10)
    ]);

    assert.deepEqual(results, ['operator-A', 'operator-B', 'operator-C', 'operator-D']);
  });

  it('propagates operator context through EventBus async publish', async () => {
    let receivedOperatorId: string | undefined;
    let receivedCorrelationId: string | undefined;

    const testEventBus = new EventBus();
    const eventHandled = new Promise<void>((resolve) => {
      testEventBus.subscribe('test.event', (payload: BaseEventPayload & { data: string }) => {
        receivedOperatorId = RequestContext.tryGet()?.operatorId;
        receivedCorrelationId = RequestContext.tryGet()?.correlationId;
        resolve();
      });
    });

    await RequestContext.run(
      { operatorId: 'operator-event-test', correlationId: 'corr-123', userId: undefined },
      async () => {
        testEventBus.publish('test.event', {
          operatorId: 'operator-event-test',
          data: 'test-data'
        });
      }
    );

    await eventHandled;

    assert.equal(receivedOperatorId, 'operator-event-test', 'Operator ID should be propagated through EventBus');
    assert.ok(receivedCorrelationId, 'Correlation ID should be propagated through EventBus');
  });

  it('propagates active RequestContext when payload omits operatorId', async () => {
    let receivedOperatorId: string | undefined;
    let receivedCorrelationId: string | undefined;
    let receivedUserId: string | undefined;

    const testEventBus = new EventBus();
    const eventHandled = new Promise<void>((resolve) => {
      testEventBus.subscribe('test.no_operator', (payload: any) => {
        receivedOperatorId = RequestContext.tryGet()?.operatorId;
        receivedCorrelationId = RequestContext.tryGet()?.correlationId;
        receivedUserId = RequestContext.tryGet()?.userId;
        resolve();
      });
    });

    await RequestContext.run(
      { operatorId: 'operator-inherited', correlationId: 'corr-inherited', userId: 'user-inherited' },
      async () => {
        testEventBus.publish('test.no_operator', {
          data: 'test-data-without-explicit-operator'
        });
      }
    );

    await eventHandled;

    assert.equal(receivedOperatorId, 'operator-inherited');
    assert.equal(receivedCorrelationId, 'corr-inherited');
    assert.equal(receivedUserId, 'user-inherited');
  });
});
