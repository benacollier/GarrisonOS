import { EventEmitter } from 'node:events';
import { RequestContext } from './context.js';
import { generateUUIDv7 } from './crypto.js';

/**
 * Base event payload containing operator and tenant identifiers.
 */
export interface BaseEventPayload {
  /** Primary operator isolation identifier. */
  operatorId?: string;
}

/**
 * Event payload emitted when a lease is activated.
 */
export interface LeaseActivatedEvent extends BaseEventPayload {
  /** Identifier of the activated lease. */
  leaseId: string;
  /** Identifier of the leased unit. */
  unitId: string;
  /** Monthly recurring rent amount in cents. */
  rentAmountCents: number;
}

/**
 * Event payload emitted when a lease is terminated.
 */
export interface LeaseTerminatedEvent extends BaseEventPayload {
  /** Identifier of the terminated lease. */
  leaseId: string;
  /** Identifier of the unit entering turnover. */
  unitId: string;
}

/**
 * Event payload emitted when a payment is recorded.
 */
export interface PaymentRecordedEvent extends BaseEventPayload {
  /** Identifier of the recorded ledger transaction. */
  transactionId: string;
  /** Identifier of the associated lease. */
  leaseId: string;
  /** Amount paid in integer cents. */
  amountCents: number;
}

/**
 * Event payload emitted when a maintenance work order is completed.
 */
export interface WorkOrderCompletedEvent extends BaseEventPayload {
  /** Identifier of the completed work order. */
  workOrderId: string;
  /** Identifier of the property. */
  propertyId: string;
  /** Optional identifier of the unit. */
  unitId?: string;
  /** Final actual cost in integer cents. */
  actualCostCents: number;
}

/**
 * Mapping of event names to typed payload structures.
 */
export type EventMap = {
  'lease.activated': LeaseActivatedEvent;
  'lease.terminated': LeaseTerminatedEvent;
  'payment.recorded': PaymentRecordedEvent;
  'work_order.completed': WorkOrderCompletedEvent;
  [key: string]: unknown;
};

/**
 * Dead-letter failure record capturing failed event subscriber executions.
 */
export interface DeadLetterFailure {
  /** Unique error record identifier. */
  id: string;
  /** Event topic name. */
  event: string;
  /** Error message. */
  error: string;
  /** Captured stack trace. */
  stack?: string;
  /** Operator context identifier if resolved. */
  operatorId?: string;
  /** Correlation identifier for request tracing. */
  correlationId?: string;
  /** UTC timestamp of the failure. */
  timestamp: number;
}

/**
 * In-process asynchronous event bus for cross-module domain messaging.
 */
export class EventBus {
  private emitter: EventEmitter;
  private deadLetters: DeadLetterFailure[] = [];
  private static readonly MAX_DEAD_LETTERS = 50;

  /**
   * Initialize a new EventBus with an increased listener capacity.
   */
  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  /**
   * Publish an event asynchronously on the next event loop tick.
   * Preserves and propagates operator context across subscriber executions.
   *
   * @param event - Event name key.
   * @param payload - Event data payload.
   */
  public publish<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
  public publish<T>(event: string, payload: T): void;
  public publish(event: string, payload: unknown): void {
    // Extract operatorId from payload if available
    const basePayload = (payload && typeof payload === 'object') ? payload as BaseEventPayload : {};
    const currentContext = RequestContext.tryGet();
    const operatorId = basePayload.operatorId || currentContext?.operatorId || 'system';
    const correlationId = currentContext?.correlationId || generateUUIDv7();
    const userId = currentContext?.userId;

    // Ensure payload retains operatorId defensively for consumers inspecting raw payload
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      if (!p['operatorId']) p['operatorId'] = operatorId;
    }

    // Dispatch asynchronously on next tick to decouple producer from consumers
    // Wrap emission in RequestContext to preserve operator isolation
    setImmediate(() => {
      RequestContext.run(
        { operatorId, correlationId, userId },
        () => this.emitter.emit(event, payload)
      );
    });
  }

  /**
   * Publish an event synchronously on the current execution thread.
   *
   * @param event - Event name key.
   * @param payload - Event data payload.
   */
  public publishSync<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
  public publishSync<T>(event: string, payload: T): void;
  public publishSync(event: string, payload: unknown): void {
    this.emitter.emit(event, payload);
  }

  /**
   * Subscribe an asynchronous or synchronous listener function to an event.
   *
   * @param event - Event name key.
   * @param handler - Callback function invoked on event emission.
   * @returns Unsubscribe function to detach listener.
   */
  public subscribe<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>
  ): () => void;
  public subscribe<T>(
    event: string,
    handler: (payload: T) => void | Promise<void>
  ): () => void;
  public subscribe(
    event: string,
    handler: (payload: any) => void | Promise<void>
  ): () => void {
    const safeWrapper = async (payload: unknown) => {
      try {
        await handler(payload);
      } catch (error: any) {
        const ctx = RequestContext.tryGet();
        const failure: DeadLetterFailure = {
          id: generateUUIDv7(),
          event,
          error: error?.message || String(error),
          stack: error?.stack,
          operatorId: ctx?.operatorId,
          correlationId: ctx?.correlationId,
          timestamp: Date.now()
        };

        this.deadLetters.unshift(failure);
        if (this.deadLetters.length > EventBus.MAX_DEAD_LETTERS) {
          this.deadLetters.pop();
        }

        process.stderr.write(`[EventBus] Error in subscriber for ${event}: ${String(error)}\n`);
      }
    };

    this.emitter.on(event, safeWrapper);
    return () => {
      this.emitter.off(event, safeWrapper);
    };
  }

  /**
   * Retrieves recent dead-letter subscriber failures for system audit and telemetry.
   *
   * @returns Array of dead-letter failure records.
   */
  public getDeadLetterFailures(): DeadLetterFailure[] {
    return [...this.deadLetters];
  }

  /**
   * Clears the in-memory dead-letter failure log.
   */
  public clearDeadLetterFailures(): void {
    this.deadLetters = [];
  }

  /**
   * Remove all registered event listeners.
   */
  public clear(): void {
    this.emitter.removeAllListeners();
  }
}

/**
 * Global singleton EventBus instance.
 */
export const eventBus = new EventBus();


