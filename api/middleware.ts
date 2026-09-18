import { ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
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

// Configurable sliding-window rate limiter settings
export interface RateLimitConfig {
  operatorMax: number;
  operatorWindowMs: number;
  authMax: number;
  authWindowMs: number;
  publicMax: number;
  publicWindowMs: number;
}

export function getRateLimitConfig(): RateLimitConfig {
  return {
    operatorMax: Number(process.env['RATE_LIMIT_OPERATOR_MAX']) || 120,
    operatorWindowMs: Number(process.env['RATE_LIMIT_OPERATOR_WINDOW_MS']) || 60 * 1000,
    authMax: Number(process.env['RATE_LIMIT_AUTH_MAX']) || 10,
    authWindowMs: Number(process.env['RATE_LIMIT_AUTH_WINDOW_MS']) || 15 * 60 * 1000,
    publicMax: Number(process.env['RATE_LIMIT_PUBLIC_MAX']) || 60,
    publicWindowMs: Number(process.env['RATE_LIMIT_PUBLIC_WINDOW_MS']) || 60 * 1000
  };
}

interface RateLimitRecord {
  attempts: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Evicts expired bucket entries from the in-memory rate limit map to prevent memory leaks.
 *
 * @param now - Current epoch timestamp in milliseconds.
 * @returns The number of evicted keys.
 */
export function evictExpiredRateLimits(now: number = Date.now()): number {
  let evicted = 0;
  for (const [key, record] of rateLimitMap.entries()) {
    if (now >= record.resetAt) {
      rateLimitMap.delete(key);
      evicted += 1;
    }
  }
  return evicted;
}

let evictionTimer: NodeJS.Timeout | null = null;

/**
 * Starts periodic background eviction of expired rate limit keys.
 *
 * @param intervalMs - Interval in milliseconds between eviction sweeps (default 60s).
 */
export function startRateLimitEviction(intervalMs = 60 * 1000): void {
  if (evictionTimer) return;
  evictionTimer = setInterval(() => {
    evictExpiredRateLimits();
  }, intervalMs);
  evictionTimer.unref();
}

/**
 * Clears all entries in the rate limit map (useful for test resets).
 */
export function resetRateLimitMap(): void {
  rateLimitMap.clear();
}

// Start eviction timer on module load
startRateLimitEviction();

/**
 * Resolves the response origin without ever reflecting an unconfigured origin.
 *
 * @param origin - The Incoming Origin header value from the client request.
 * @param allowedOrigins - Set of configured allowed origin URLs.
 * @returns The matching allowed origin or the first configured fallback origin.
 */
export function resolveCorsOrigin(origin: string | undefined, allowedOrigins: ReadonlySet<string>): string | undefined {
  if (origin && allowedOrigins.has(origin)) return origin;
  return allowedOrigins.values().next().value;
}

/**
 * Security headers and CORS middleware. Applies defensive headers (CSP, nosniff, DENY)
 * and verifies origin against the configured whitelist.
 *
 * @param req - The API request object.
 * @param res - The HTTP server response object.
 * @param next - Function to invoke the next middleware in the pipeline.
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Operator-ID, X-Request-ID, X-User-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  await next();
};

/**
 * Correlation ID tracking middleware. Extracts incoming X-Request-ID or generates
 * a new RFC 9562 UUIDv7 for distributed tracing.
 *
 * @param req - The API request object.
 * @param res - The HTTP server response object.
 * @param next - Function to invoke the next middleware in the pipeline.
 */
export const correlationMiddleware: Middleware = async (req, res, next) => {
  const headerId = req.headers['x-request-id'];
  const correlationId = typeof headerId === 'string' && headerId.trim() ? headerId.trim() : generateUUIDv7();
  req.correlationId = correlationId;
  res.setHeader('X-Request-ID', correlationId);
  await next();
};

/**
 * In-memory sliding-window rate limiter applying configurable limits across all routes.
/**
 * Set of reserved operator subdomain identifiers that cannot be registered or resolved as tenants.
 */
export const RESERVED_SUBDOMAINS = new Set([
  'localhost',
  '127',
  'api',
  'app',
  'portal',
  'www',
  'system',
  'admin'
]);

/**
 * Sliding-window rate limiter middleware protecting public, auth, and operational endpoints.
 * Keys by verified operator ID when authenticated, and falls back to client IP whenever
 * no verified operator identity is present.
 *
 * @param req - The API request object.
 * @param res - The HTTP server response object.
 * @param next - Function to invoke the next middleware in the pipeline.
 */
export const rateLimitMiddleware: Middleware = async (req, res, next) => {
  const config = getRateLimitConfig();
  const now = Date.now();
  const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const ip = (rawIp.includes(',') ? rawIp.split(',')[0]!.trim() : rawIp.trim()) || '127.0.0.1';

  let key: string;
  let maxAttempts: number;
  let windowMs: number;

  const isAuthOrSetup = (
    req.path.startsWith('/api/v1/auth/') ||
    req.path === '/api/v1/system/setup' ||
    req.path === '/api/v1/system/restore'
  );

  // Use only verified operator identity populated from verified token opid
  let verifiedOperatorId = req.verifiedOperatorId;
  if (!verifiedOperatorId) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      try {
        const payload = verifyToken(token, APP_SECRET);
        if (payload && typeof payload.opid === 'string' && payload.opid) {
          verifiedOperatorId = payload.opid;
          req.verifiedOperatorId = verifiedOperatorId;
        }
      } catch {
        // Fall back to public IP bucket on token verification failure
      }
    }
  }

  if (isAuthOrSetup) {
    key = `ratelimit:auth:${ip}:${req.path}`;
    maxAttempts = config.authMax;
    windowMs = config.authWindowMs;
  } else if (verifiedOperatorId) {
    key = `ratelimit:operator:${verifiedOperatorId}`;
    maxAttempts = config.operatorMax;
    windowMs = config.operatorWindowMs;
  } else {
    key = `ratelimit:public:${ip}`;
    maxAttempts = config.publicMax;
    windowMs = config.publicWindowMs;
  }

  const record = rateLimitMap.get(key);
  if (record) {
    if (now < record.resetAt) {
      if (record.attempts >= maxAttempts) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((record.resetAt - now) / 1000))));
        return errorResponse(
          res,
          'RATE_LIMITED',
          'Too many requests. Please try again later.',
          429
        );
      }
      record.attempts += 1;
    } else {
      rateLimitMap.set(key, { attempts: 1, resetAt: now + windowMs });
    }
  } else {
    rateLimitMap.set(key, { attempts: 1, resetAt: now + windowMs });
  }

  await next();
};

/**
 * Constant-time verification of candidate APP_SECRET strings to prevent timing attacks.
 *
 * @param candidate - Candidate secret provided in request headers.
 * @returns True if candidate exactly matches APP_SECRET in constant time.
 */
function verifyAppSecret(candidate: string | undefined): boolean {
  if (!candidate || !APP_SECRET) return false;
  const candBuf = Buffer.from(candidate);
  const secretBuf = Buffer.from(APP_SECRET);
  if (candBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(candBuf, secretBuf);
}

/**
 * Resolves operator context identifier based on the configured routing mode:
 * - 'subdomain': Resolves from Host header (e.g. summit.example.com -> summit)
 * - 'path': Resolves from req.operatorSlug (extracted by Router from /o/:slug/* or /operator/:slug/*)
 * - 'both': Attempts path resolution first, falling back to subdomain resolution.
 *
 * @param req - Incoming API request.
 * @param db - Synchronous SQLite database client.
 * @returns Operator UUID if matched, or null.
 */
export function resolveOperatorFromRequest(req: ApiRequest, db: any): string | null {
  const routingMode = (process.env['OPERATOR_ROUTING_MODE'] || 'subdomain').toLowerCase();

  // 1. Path-based resolution from req.operatorSlug
  if (routingMode === 'path' || routingMode === 'both') {
    if (req.operatorSlug) {
      const row = db.prepare(
        'SELECT id FROM operators WHERE subdomain = ? AND deleted_at IS NULL'
      ).get(req.operatorSlug) as { id: string } | undefined;
      if (row) return row.id;
    }
  }

  // 2. Subdomain-based resolution from Host header: {subdomain}.domain.com
  if (routingMode === 'subdomain' || routingMode === 'both') {
    const host = (req.headers['host'] as string) || '';
    const hostWithoutPort = host.split(':')[0]!.trim().toLowerCase();
    const parts = hostWithoutPort.split('.');
    if (parts.length >= 2) {
      const candidate = parts[0]!;
      if (!RESERVED_SUBDOMAINS.has(candidate)) {
        const row = db.prepare(
          'SELECT id FROM operators WHERE subdomain = ? AND deleted_at IS NULL'
        ).get(candidate) as { id: string } | undefined;
        if (row) return row.id;
      }
    }
  }

  return null;
}

/**
 * Multi-operator resolution and AsyncLocalStorage context execution wrapper.
 * Resolves operator context from headers and bearer tokens, verifies identity consistency,
 * and wraps execution within RequestContext.
 *
 * @param req - The API request object.
 * @param res - The HTTP server response object.
 * @param next - Function to invoke the next middleware in the pipeline.
 */
export const operatorContextMiddleware: Middleware = async (req, res, next) => {
  const isBatchRoute = req.path === '/api/v1/batch' || req.path === '/api/v1/batch/';
  const isPlatformProvisioningRoute = req.path === '/api/v1/system/operators';
  const isAdministratorRoute = (
    req.path === '/api/v1/system/backup' ||
    req.path === '/api/v1/backups/scheduler/trigger' ||
    isPlatformProvisioningRoute
  );
  const isPublicRoute = (
    req.path === '/health' ||
    req.path === '/ready' ||
    req.path.startsWith('/api/v1/auth/') ||
    req.path === '/api/v1/system/status' ||
    req.path === '/api/v1/system/setup' ||
    req.path === '/api/v1/system/restore'
  );

  // Check APP_SECRET setup handshake for administrative orchestration
  const authHeader = req.headers['authorization'];
  const secretHeader = (req.headers['x-app-secret'] as string) || (req.headers['x-setup-key'] as string);
  let isHandshakeAuthorized = verifyAppSecret(secretHeader);
  if (!isHandshakeAuthorized && authHeader && authHeader.startsWith('Bearer ')) {
    const bearerCandidate = authHeader.slice(7).trim();
    if (verifyAppSecret(bearerCandidate)) {
      isHandshakeAuthorized = true;
    }
  }

  if (isPlatformProvisioningRoute && !isHandshakeAuthorized) {
    return errorResponse(
      res,
      'FORBIDDEN',
      'System operator provisioning requires platform administrative credentials',
      403
    );
  }

  if (isAdministratorRoute && isHandshakeAuthorized) {
    const operatorId = (req.headers['x-operator-id'] as string) || 'system';
    req.operatorId = operatorId;
    req.userId = 'system';
    await RequestContext.run(
      {
        operatorId,
        userId: 'system',
        correlationId: req.correlationId || generateUUIDv7()
      },
      async () => {
        await next();
      }
    );
    return;
  }

  let operatorId = isBatchRoute ? '' : ((req.headers['x-operator-id'] as string) || '');

  // Fallback to path or subdomain operator resolution if not provided via X-Operator-ID header
  if (!operatorId && !isBatchRoute && !isPublicRoute && !isAdministratorRoute) {
    const db = getDatabase();
    operatorId = resolveOperatorFromRequest(req, db) || '';
  }

  // Cross-check: If route includes /o/:slug path, verify that it matches operatorId
  if (req.operatorSlug && operatorId) {
    const db = getDatabase();
    const slugOpId = resolveOperatorFromRequest(req, db);
    if (slugOpId && slugOpId !== operatorId) {
      return errorResponse(
        res,
        'UNAUTHORIZED',
        'Operator identity does not match the URL route path',
        401
      );
    }
  }
  const headerUserId = isBatchRoute ? undefined : ((req.headers['x-user-id'] as string) || undefined);
  let userId: string | undefined = undefined;
  let batchAuthenticated = false;

  // Extract Bearer token if present
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
      const tokenOpId = typeof payload.opid === 'string' ? payload.opid : '';
      if (tokenOpId) {
        req.verifiedOperatorId = tokenOpId;
      }
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
    } else if (!isPublicRoute) {
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
  req.userId = userId;

  if (isAdministratorRoute) {
    if (!operatorId || !userId) {
      return errorResponse(
        res,
        'FORBIDDEN',
        'Administrator authentication is required',
        403
      );
    }

    const db = getDatabase();
    const administrator = db.prepare(
      'SELECT 1 FROM users WHERE id = ? AND operator_id = ? AND role = ? AND deleted_at IS NULL'
    ).get(userId, operatorId, 'owner');
    if (!administrator) {
      return errorResponse(
        res,
        'FORBIDDEN',
        'Administrator authentication is required',
        403
      );
    }
  }

  if (!isPublicRoute && !operatorId) {
    return errorResponse(
      res,
      'OPERATOR_REQUIRED',
      'The X-Operator-ID header is required for this operational endpoint',
      400
    );
  }

  // Wrap downstream execution inside RequestContext
  await RequestContext.run(
    {
      operatorId: operatorId || 'system',
      userId,
      correlationId: req.correlationId || generateUUIDv7()
    },
    async () => {
      await next();
    }
  );
};
