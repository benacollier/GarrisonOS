import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Execution context metadata tracked across an asynchronous request lifecycle.
 */
export interface RequestContextData {
  /**
   * The active operator isolation ID.
   */
  operatorId?: string;

  /**
   * Legacy alias for operatorId retained for backward compatibility.
   */
  tenantId?: string;

  /**
   * Authenticated user ID, if request is authenticated.
   */
  userId?: string;

  /**
   * Unique correlation ID for request tracing and log aggregation.
   */
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();

/**
 * Ambient request context store backed by AsyncLocalStorage.
 * Guarantees operator isolation and request metadata propagation without parameter passing.
 */
export class RequestContext {
  /**
   * Runs an asynchronous or synchronous function within the specified request context store.
   *
   * @typeParam T - Return type of the executed function.
   * @param context - Request context metadata containing operator, user, and correlation identifiers.
   * @param fn - Function to execute within the ambient storage scope.
   * @returns The value returned by `fn`.
   */
  public static run<T>(context: RequestContextData, fn: () => T): T {
    if (!context.operatorId && context.tenantId) {
      context.operatorId = context.tenantId;
    }
    return storage.run(context, fn);
  }

  /**
   * Retrieves the active request context, throwing if invoked outside an active request scope.
   *
   * @returns The active `RequestContextData`.
   * @throws Error if called outside of `RequestContext.run`.
   */
  public static get(): RequestContextData {
    const context = storage.getStore();
    if (!context) {
      throw new Error('No active request context found in execution store');
    }
    return context;
  }

  /**
   * Attempts to retrieve the active request context without throwing if absent.
   *
   * @returns The active `RequestContextData` or `undefined` if called outside an active scope.
   */
  public static tryGet(): RequestContextData | undefined {
    return storage.getStore();
  }

  /**
   * Retrieves the active operator isolation ID from context.
   *
   * @returns The operator ID string.
   * @throws Error if called outside of `RequestContext.run`.
   */
  public static getOperatorId(): string {
    const ctx = RequestContext.get();
    return ctx.operatorId || ctx.tenantId || '';
  }

  /**
   * Retrieves the active tenant/operator ID.
   *
   * @deprecated Use getOperatorId() instead. Retained for backward compatibility.
   * @returns The operator/tenant ID string.
   */
  public static getTenantId(): string {
    return RequestContext.getOperatorId();
  }

  /**
   * Retrieves the authenticated user ID from context, if present.
   *
   * @returns The user ID string, or undefined if unauthenticated.
   * @throws Error if called outside of `RequestContext.run`.
   */
  public static getUserId(): string | undefined {
    return RequestContext.get().userId;
  }

  /**
   * Retrieves the unique correlation ID for the active request.
   *
   * @returns The correlation ID string.
   * @throws Error if called outside of `RequestContext.run`.
   */
  public static getCorrelationId(): string {
    return RequestContext.get().correlationId;
  }
}

