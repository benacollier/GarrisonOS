import { EventEmitter } from 'node:events';

export interface BaseEventPayload {
  tenantId: string;
}

export interface LeaseActivatedEvent extends BaseEventPayload {
  leaseId: string;
  unitId: string;
  rentAmountCents: number;
}

export interface LeaseTerminatedEvent extends BaseEventPayload {
  leaseId: string;
  unitId: string;
}

export interface PaymentRecordedEvent extends BaseEventPayload {
  transactionId: string;
  leaseId: string;
  amountCents: number;
}

export interface WorkOrderCompletedEvent extends BaseEventPayload {
  workOrderId: string;
  propertyId: string;
  unitId?: string;
  actualCostCents: number;
}

export type EventMap = {
  'lease.activated': LeaseActivatedEvent;
  'lease.terminated': LeaseTerminatedEvent;
  'payment.recorded': PaymentRecordedEvent;
  'work_order.completed': WorkOrderCompletedEvent;
  [key: string]: unknown;
};

export class EventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  public publish<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
  public publish<T>(event: string, payload: T): void;
  public publish(event: string, payload: unknown): void {
    // Dispatch asynchronously on next tick to decouple producer from consumers
    setImmediate(() => {
      this.emitter.emit(event, payload);
    });
  }

  public publishSync<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
  public publishSync<T>(event: string, payload: T): void;
  public publishSync(event: string, payload: unknown): void {
    this.emitter.emit(event, payload);
  }

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
      } catch (error) {
        process.stderr.write(`[EventBus] Error in subscriber for ${event}: ${String(error)}\n`);
      }
    };

    this.emitter.on(event, safeWrapper);
    return () => {
      this.emitter.off(event, safeWrapper);
    };
  }

  public clear(): void {
    this.emitter.removeAllListeners();
  }
}

export const eventBus = new EventBus();

