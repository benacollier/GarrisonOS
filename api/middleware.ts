import { ServerResponse } from 'node:http';
import { ApiRequest, Middleware } from './router.js';
import { errorResponse } from './response.js';
import { generateUUIDv7, verifyToken, verifyTokenWithDatabase } from '../core/crypto.js';
import { RequestContext } from '../core/context.js';
import { getDatabase } from '../database/client.js';

const NODE_ENV = process.env['NODE_ENV'] || 'development';
const APP_SECRET = process.env['APP_SECRET'] || (
  NODE_ENV === 'development' || NODE_ENV === 'test'
    ? 'garrison-os-development-secret'
    : ''
);
const CORS_ALLOWED_ORIGINS = new Set(
  (process.env['CORS_ALLOWED_ORIGINS'] || process.env['ALLOWED_ORIGINS'] || (
    NODE_ENV === 'development'
      ? `http://${process.env['WEB_HOST'] || 'localhost'}:${process.env['WEB_PORT'] || '8080'}`
      : ''
  ))
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
);

// Sliding-window rate limiter state
interface RateLimitRecord {
  attempts: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 10;

/**
 * Resolve the response origin without ever reflecting an unconfigured origin.
 */
export function resolveCorsOrigin(origin: string | undefined, allowedOrigins: ReadonlySet<string>): string | undefined {
  if (origin && allowedOrigins.has(origin)) return origin;
  return allowedOrigins.values().next().value;
}

/**
 * Security headers and CORS middleware.
 */
export const securityHeadersMiddleware: Middleware = async (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  const origin = req.headers.origin;
  const allowedOrigin = resolveCorsOrigin(typeof origin === 'string' ? origin : undefined, CORS_ALLOWED_ORIGINS);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Operator-ID, X-Tenant-ID, X-Request-ID, X-User-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  await next();
};

/**
 * Correlation ID tracking middleware.
 */
export const correlationMiddleware: Middleware = async (req, res, next) => {
  const headerId = req.headers['x-request-id'];
  const correlationId = typeof headerId === 'string' && headerId.trim() ? headerId.trim() : generateUUIDv7();
  req.correlationId = correlationId;
  res.setHeader('X-Request-ID', correlationId);
  await next();
};

/**
 * In-memory sliding-window rate limiter for sensitive authentication routes.
 */
export const rateLimitMiddleware: Middleware = async (req, res, next) => {
  if (req.path.startsWith('/api/v1/auth/') || req.path === '/api/v1/system/setup' || req.path === '/api/v1/system/restore') {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const key = `ratelimit:${ip}:${req.path}`;

    const record = rateLimitMap.get(key);
    if (record) {
      if (now < record.resetAt) {
        if (record.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
          return errorResponse(
            res,
            'RATE_LIMITED',
            'Too many requests. Please try again later.',
            429
          );
        }
        record.attempts += 1;
      } else {
        rateLimitMap.set(key, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      }
    } else {
      rateLimitMap.set(key, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
  }
  await next();
};

/**
 * Multi-operator resolution and AsyncLocalStorage context execution wrapper.
 */
export const operatorContextMiddleware: Middleware = async (req, res, next) => {
  const isBatchRoute = req.path === '/api/v1/batch' || req.path === '/api/v1/batch/';
  const isAdministratorRoute = (
    req.path === '/api/v1/system/backup' ||
    req.path === '/api/v1/backups/scheduler/trigger'
  );
  const isPublicRoute = (
    req.path === '/health' ||
    req.path === '/ready' ||
    req.path.startsWith('/api/v1/auth/') ||
    req.path === '/api/v1/system/status' ||
    req.path === '/api/v1/system/setup' ||
    req.path === '/api/v1/system/restore'
  );

  let operatorId = isBatchRoute ? '' : ((req.headers['x-operator-id'] as string) || (req.headers['x-tenant-id'] as string) || '');
  const headerUserId = isBatchRoute ? undefined : ((req.headers['x-user-id'] as string) || undefined);
  let userId: string | undefined = undefined;
  let batchAuthenticated = false;

  // Extract Bearer token if present
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    let payload: any = null;

    if (!isPublicRoute) {
      // Use version-aware verification for non-public routes
      const db = getDatabase();
      payload = verifyTokenWithDatabase(token, APP_SECRET, db);
    } else {
      // For public routes (login, setup), use simple verification
      payload = verifyToken(token, APP_SECRET);
    }

    if (payload) {
      const tokenOpId = typeof payload.opid === 'string' ? payload.opid : (typeof payload.tid === 'string' ? payload.tid : '');
      if (isBatchRoute) {
        operatorId = tokenOpId;
        userId = typeof payload.sub === 'string' ? payload.sub : undefined;
        batchAuthenticated = operatorId.length > 0 && typeof userId === 'string' && userId.length > 0;
      } else {
        if (!isPublicRoute && operatorId && tokenOpId && tokenOpId !== operatorId) {
          return errorResponse(
            res,
            'UNAUTHORIZED',
            'Operator identity does not match the authentication token',
            401
          );
        }
        if (!isPublicRoute && headerUserId && payload.sub !== headerUserId) {
          return errorResponse(
            res,
            'UNAUTHORIZED',
            'User identity does not match authentication token',
            401
          );
        }
        if (!operatorId) operatorId = tokenOpId;
        userId = typeof payload.sub === 'string' ? payload.sub : undefined;
      }
    } else if (authHeader && !isPublicRoute) {
      return errorResponse(
        res,
        'UNAUTHORIZED',
        'Invalid or expired authentication token',
        401
      );
    }
  }

  if (isBatchRoute && !batchAuthenticated) {
    return errorResponse(
      res,
      'UNAUTHORIZED',
      'A valid bearer token is required for batch requests',
      401
    );
  }

  req.operatorId = operatorId;
  req.tenantId = operatorId; // Alias
  req.userId = userId;

  if (!isPublicRoute && !operatorId) {
    return errorResponse(
      res,
      'OPERATOR_REQUIRED',
      'The X-Operator-ID header is required for this operational endpoint',
      400
    );
  }

  if (isAdministratorRoute) {
    const db = getDatabase();
    const administrator = userId
      ? db.prepare(
        'SELECT 1 FROM users WHERE id = ? AND operator_id = ? AND role = ? AND deleted_at IS NULL'
      ).get(userId, operatorId, 'owner')
      : undefined;
    if (!administrator) {
      return errorResponse(
        res,
        'FORBIDDEN',
        'Administrator authentication is required',
        403
      );
    }
  }

  // Wrap downstream execution inside RequestContext
  await RequestContext.run(
    {
      operatorId: operatorId || 'system',
      tenantId: operatorId || 'system',
      userId,
      correlationId: req.correlationId || generateUUIDv7()
    },
    async () => {
      await next();
    }
  );
};

/**
 * Backward-compatible alias for operatorContextMiddleware.
 */
export const tenantContextMiddleware = operatorContextMiddleware;
