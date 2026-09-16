import { ServerResponse } from 'node:http';
import { ApiRequest, Middleware } from './router.js';
import { errorResponse } from './response.js';
import { generateUUIDv7, verifyToken, verifyTokenWithDatabase } from '../core/crypto.js';
import { RequestContext } from '../core/context.js';
import { getDatabase } from '../database/client.js';

const APP_SECRET = process.env['APP_SECRET'] || 'garrison-os-default-secret-key-change-in-production';

// Sliding-window rate limiter state
interface RateLimitRecord {
  attempts: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 10;

/**
 * Security headers and CORS middleware
 */
export const securityHeadersMiddleware: Middleware = async (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID, X-Request-ID, X-User-ID');
  await next();
};

/**
 * Correlation ID tracking middleware
 */
export const correlationMiddleware: Middleware = async (req, res, next) => {
  const headerId = req.headers['x-request-id'];
  const correlationId = typeof headerId === 'string' && headerId.trim() ? headerId.trim() : generateUUIDv7();
  req.correlationId = correlationId;
  res.setHeader('X-Request-ID', correlationId);
  await next();
};

/**
 * In-memory sliding-window rate limiter for sensitive authentication routes
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
 * Multi-tenant resolution & AsyncLocalStorage context execution wrapper
 */
export const tenantContextMiddleware: Middleware = async (req, res, next) => {
  const isPublicRoute = (
    req.path === '/health' ||
    req.path === '/ready' ||
    req.path.startsWith('/api/v1/auth/') ||
    req.path.startsWith('/api/v1/system/backup') ||
    req.path === '/api/v1/system/status' ||
    req.path === '/api/v1/system/setup' ||
    req.path === '/api/v1/system/restore'
  );

  let tenantId = (req.headers['x-tenant-id'] as string) || '';
  let userId = (req.headers['x-user-id'] as string) || undefined;

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
      if (!tenantId) tenantId = payload.tid;
      if (!userId) userId = payload.sub;
    } else if (authHeader && !isPublicRoute) {
      return errorResponse(
        res,
        'UNAUTHORIZED',
        'Invalid or expired authentication token',
        401
      );
    }
  }

  req.tenantId = tenantId;
  req.userId = userId;

  if (!isPublicRoute && !tenantId) {
    return errorResponse(
      res,
      'TENANT_REQUIRED',
      'The X-Tenant-ID header is required for this operational endpoint',
      400
    );
  }

  // Wrap downstream execution inside RequestContext
  await RequestContext.run(
    {
      tenantId: tenantId || 'system',
      userId,
      correlationId: req.correlationId || generateUUIDv7()
    },
    async () => {
      await next();
    }
  );
};

