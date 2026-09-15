import { createServer as createHttpServer, Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Router } from './router.js';
import {
  securityHeadersMiddleware,
  correlationMiddleware,
  rateLimitMiddleware,
  tenantContextMiddleware
} from './middleware.js';
import { successResponse, errorResponse } from './response.js';
import { getDatabase, closeDatabase } from '../database/client.js';
import { eventBus } from '../core/events.js';
import { loadModules, getLoadedModules } from '../core/module-loader.js';
import { verifyPassword, createToken, generateUUIDv7 } from '../core/crypto.js';
import { RequestContext } from '../core/context.js';

const APP_SECRET = process.env['APP_SECRET'] || 'garrison-os-default-secret-key-change-in-production';
const PORT = parseInt(process.env['PORT'] || '3000', 10);
const HOST = process.env['HOST'] || '127.0.0.1';

export function createRouter(): Router {
  const router = new Router();

  // Attach middleware stack
  router.use(securityHeadersMiddleware);
  router.use(correlationMiddleware);
  router.use(rateLimitMiddleware);
  router.use(tenantContextMiddleware);

  // Health and readiness checks
  router.get('/health', (_req, res) => {
    successResponse(res, {
      status: 'ok',
      version: '1.0.0',
      timestamp: Date.now()
    });
  });

  router.get('/ready', (_req, res) => {
    try {
      const db = getDatabase();
      db.prepare('SELECT 1').get();
      successResponse(res, {
        status: 'ready',
        database: 'connected',
        timestamp: Date.now()
      });
    } catch (err: any) {
      errorResponse(res, 'SERVICE_UNAVAILABLE', `Database unreachable: ${err.message}`, 503);
    }
  });

  // Loaded modules introspection
  router.get('/api/v1/modules', (_req, res) => {
    const modules = getLoadedModules().map((m) => m.manifest);
    successResponse(res, { modules });
  });

  // Authentication: Operator Login
  router.post('/api/v1/auth/login', async (req, res) => {
    const { email, password, tenant_id } = req.body || {};
    if (!email || !password) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Email and password are required', 400);
    }

    const db = getDatabase();
    let query = 'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL';
    const params: any[] = [email];

    if (tenant_id) {
      query += ' AND tenant_id = ?';
      params.push(tenant_id);
    }

    const user = db.prepare(query).get(...params) as any;
    if (!user) {
      return errorResponse(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return errorResponse(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Generate session token valid for 24 hours
    const token = createToken(
      {
        sub: user.id,
        tid: user.tenant_id,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 86400
      },
      APP_SECRET
    );

    // Record audit log
    try {
      db.prepare(`
        INSERT INTO audit_logs (id, tenant_id, user_id, entity_type, entity_id, action, changes_json, ip_address, created_at)
        VALUES (?, ?, ?, 'user', ?, 'login', ?, ?, ?)
      `).run(
        generateUUIDv7(),
        user.tenant_id,
        user.id,
        user.id,
        JSON.stringify({ email: user.email }),
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
        Date.now()
      );
    } catch {
      // Non-blocking audit log
    }

    successResponse(res, {
      token,
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  });

  // System Database Backup Snapshot
  router.get('/api/v1/system/backup', (_req, res) => {
    try {
      const db = getDatabase();
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      const dbPath = process.env['SQLITE_PATH'] || './garrison.sqlite';
      const resolvedPath = path.resolve(dbPath);
      
      if (!fs.existsSync(resolvedPath)) {
        return errorResponse(res, 'NOT_FOUND', 'Database file not found', 404);
      }

      const fileStream = fs.createReadStream(resolvedPath);
      res.writeHead(200, {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': `attachment; filename="garrison-backup-${Date.now()}.sqlite"`
      });
      fileStream.pipe(res);
    } catch (err: any) {
      errorResponse(res, 'BACKUP_FAILED', err.message, 500);
    }
  });

  return router;
}

export async function startServer(
  port: number = PORT,
  host: string = HOST
): Promise<{ server: HttpServer; router: Router }> {
  const router = createRouter();

  // Load all functional modules dynamically
  await loadModules(router, eventBus);

  const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    router.handle(req, res);
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      process.stdout.write(`GarrisonOS API Engine listening at http://${host}:${port}\n`);
      resolve({ server, router });
    });
  });
}

// CLI Execution Entrypoint
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.js') ||
  (import.meta.url && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
);

if (isDirectExecution) {
  startServer().catch((err) => {
    process.stderr.write(`Failed to start GarrisonOS server: ${String(err)}\n`);
    process.exit(1);
  });

  const cleanup = () => {
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
