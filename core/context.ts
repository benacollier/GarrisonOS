import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  operatorId?: string;
  tenantId?: string;
  userId?: string;
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export class RequestContext {
  public static run<T>(context: RequestContextData, fn: () => T): T {
    if (!context.operatorId && context.tenantId) {
      context.operatorId = context.tenantId;
    }
    return storage.run(context, fn);
  }

  public static get(): RequestContextData {
    const context = storage.getStore();
    if (!context) {
      throw new Error('No active request context found in execution store');
    }
    return context;
  }

  public static tryGet(): RequestContextData | undefined {
    return storage.getStore();
  }

  public static getOperatorId(): string {
    const ctx = RequestContext.get();
    return ctx.operatorId || ctx.tenantId || '';
  }

  /**
   * @deprecated Use getOperatorId() instead. Retained for backward compatibility.
   */
  public static getTenantId(): string {
    return RequestContext.getOperatorId();
  }

  public static getUserId(): string | undefined {
    return RequestContext.get().userId;
  }

  public static getCorrelationId(): string {
    return RequestContext.get().correlationId;
  }
}

