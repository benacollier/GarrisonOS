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
import { getDatabase, closeDatabase, withTransaction } from '../database/client.js';
import { eventBus } from '../core/events.js';
import { loadModules, getLoadedModules } from '../core/module-loader.js';
import { verifyPassword, hashPassword, createToken, generateUUIDv7 } from '../core/crypto.js';
import { RequestContext } from '../core/context.js';
import { getApplicationVersion } from '../core/version.js';

const NODE_ENV = process.env['NODE_ENV'] || 'development';
const APP_SECRET = process.env['APP_SECRET'] || (
  NODE_ENV === 'development' || NODE_ENV === 'test'
    ? 'garrison-os-development-secret'
    : ''
);
const PORT = parseInt(process.env['PORT'] || '3000', 10);
const HOST = process.env['HOST'] || '127.0.0.1';

/**
 * Validate that deployments outside local development use a strong HMAC secret.
 *
 * @param nodeEnv Runtime environment name.
 * @param appSecret Candidate HMAC secret.
 * @throws Error when a non-development environment has an invalid secret.
 */
export function validateEnvironment(nodeEnv: string, appSecret: string | undefined): void {
  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    !/^(?:[a-f0-9]{2}){32,}$/i.test(appSecret?.trim() ?? '')
  ) {
    throw new Error(
      'APP_SECRET must contain at least 32 bytes encoded as hexadecimal before starting the server outside development and test environments'
    );
  }
}

/**
 * Create the API router and register core routes and middleware.
 *
 * @param serverPort Loopback port used by internal batch requests.
 * @returns A configured API router.
 */
export function createRouter(serverPort: number = PORT): Router {
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
      version: getApplicationVersion(),
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

  // Execute a bounded set of read-only API requests concurrently.
  router.post('/api/v1/batch', async (req, res) => {
    const requests = req.body?.requests;
    if (!Array.isArray(requests) || requests.length === 0 || requests.length > 10) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Batch requests must contain between 1 and 10 items', 400);
    }

    const validatedRequests: Array<{ path: string; method: 'GET' }> = [];
    for (const item of requests) {
      if (
        !item ||
        typeof item.path !== 'string' ||
        item.path.length > 512 ||
        !(item.path === '/health' || item.path === '/ready' || item.path.startsWith('/api/v1/')) ||
        item.path === '/api/v1/batch' ||
        (item.method !== undefined && item.method !== 'GET')
      ) {
        return errorResponse(res, 'VALIDATION_ERROR', 'Batch supports only GET requests to /api/v1/ endpoints', 400);
      }
      validatedRequests.push({ path: item.path, method: 'GET' });
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Request-ID': req.correlationId || generateUUIDv7()
    };
    for (const headerName of ['authorization']) {
      const value = req.headers[headerName];
      if (typeof value === 'string') headers[headerName] = value;
    }

    try {
      const responseEntries = await Promise.all(validatedRequests.map(async ({ path, method }) => {
        try {
          const response = await fetch(`http://127.0.0.1:${serverPort}${path}`, { method, headers });
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.toLowerCase().includes('application/json')) {
            return {
              path,
              status: response.status,
              success: false,
              error: {
                code: 'NON_JSON_RESPONSE',
                message: 'Batch requests support JSON responses only',
                contentType: contentType || 'unknown'
              }
            };
          }

          try {
            const envelope = await response.json() as Record<string, unknown>;
            return { path, status: response.status, ...envelope };
          } catch {
            return {
              path,
              status: 502,
              success: false,
              error: {
                code: 'INVALID_BATCH_RESPONSE',
                message: 'The endpoint returned an invalid JSON response'
              }
            };
          }
        } catch {
          return {
            path,
            status: 502,
            success: false,
            error: {
              code: 'BATCH_ITEM_FAILED',
              message: 'Unable to complete this batch request'
            }
          };
        }
      }));
      const responses: Record<string, Record<string, unknown>> = {};
      responseEntries.forEach((entry, index) => {
        responses[`response_${index}`] = entry;
      });
      successResponse(res, { responses }, 200, {
        total: responseEntries.length,
        page: 1,
        limit: responseEntries.length
      });
    } catch {
      errorResponse(res, 'BATCH_FAILED', 'Unable to complete batch request', 502);
    }
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

    // Generate session token valid for 24 hours with token version
    const token = createToken(
      {
        sub: user.id,
        tid: user.tenant_id,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 86400,
        tv: user.token_version || 1
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

  // System Setup Status
  router.get('/api/v1/system/status', (_req, res) => {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL').get() as { count: number };
      const userCount = Number(row?.count || 0);
      const isConfigured = userCount > 0;
      const backupModuleEnabled = getLoadedModules().some((m) => m.manifest.id === 'backup');

      successResponse(res, {
        is_configured: isConfigured,
        user_count: userCount,
        backup_module_enabled: backupModuleEnabled
      });
    } catch (err: any) {
      errorResponse(res, 'SYSTEM_ERROR', err.message, 500);
    }
  });

  // System First-Launch Setup
  router.post('/api/v1/system/setup', async (req, res) => {
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL').get() as { count: number };
    if (Number(countRow?.count || 0) > 0) {
      return errorResponse(res, 'ALREADY_CONFIGURED', 'System is already configured with an administrator account', 403);
    }

    const {
      organization_name,
      first_name,
      last_name,
      email,
      password,
      seed_demo_data
    } = req.body || {};

    const cleanOrg = typeof organization_name === 'string' ? organization_name.trim() : '';
    const cleanFirst = typeof first_name === 'string' ? first_name.trim() : '';
    const cleanLast = typeof last_name === 'string' ? last_name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!cleanOrg) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Organization name is required', 400);
    }
    if (!cleanFirst || !cleanLast) {
      return errorResponse(res, 'VALIDATION_ERROR', 'First name and last name are required', 400);
    }
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return errorResponse(res, 'VALIDATION_ERROR', 'A valid email address is required', 400);
    }
    if (cleanPassword.length < 8) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Password must be at least 8 characters long', 400);
    }

    const now = Date.now();
    const tenantId = generateUUIDv7();
    const userId = generateUUIDv7();
    const passwordHash = await hashPassword(cleanPassword);

    try {
      await withTransaction(async (tx) => {
        // 1. Create primary tenant
        tx.prepare(`
          INSERT INTO tenants (id, name, subdomain, currency, created_at, updated_at)
          VALUES (?, ?, ?, 'USD', ?, ?)
        `).run(tenantId, cleanOrg, 'primary', now, now);

        // 2. Create owner user
        tx.prepare(`
          INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, token_version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'owner', 1, ?, ?)
        `).run(userId, tenantId, cleanEmail, passwordHash, cleanFirst, cleanLast, now, now);

        // 3. Audit log
        tx.prepare(`
          INSERT INTO audit_logs (id, tenant_id, user_id, entity_type, entity_id, action, changes_json, ip_address, created_at)
          VALUES (?, ?, ?, 'system', ?, 'create', ?, ?, ?)
        `).run(
          generateUUIDv7(),
          tenantId,
          userId,
          tenantId,
          JSON.stringify({ organization_name: cleanOrg, email: cleanEmail }),
          (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
          now
        );

        // 4. If demo data requested, seed sample records under this new tenant
        if (seed_demo_data === true) {
          // Initialize Chart of Accounts if table exists
          const tableCheck = tx.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chart_of_accounts'").get();
          if (tableCheck) {
            const accounts: [string, string, string, string][] = [
              ['1010', 'Operating Checking', 'Bank', 'Bank'],
              ['1100', 'Accounts Receivable', 'AccountsReceivable', 'AccountsReceivable'],
              ['2010', 'Security Deposits Liability', 'OtherCurrentLiability', 'OtherCurrentLiability'],
              ['4010', 'Rental Income', 'Income', 'Income'],
              ['4020', 'Late Fee Income', 'Income', 'Income'],
              ['5100', 'Repairs & Maintenance', 'Expense', 'Expense']
            ];
            for (const [num, name, type, qbType] of accounts) {
              tx.prepare(`
                INSERT INTO chart_of_accounts (id, tenant_id, account_number, account_name, account_type, qb_account_type, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
              `).run(generateUUIDv7(), tenantId, num, name, type, qbType, now, now);
            }
          }

          // Sample portfolio
          const portId = generateUUIDv7();
          tx.prepare(`
            INSERT INTO portfolios (id, tenant_id, name, notes, created_at, updated_at)
            VALUES (?, ?, 'Primary Portfolio', 'Initial sample portfolio created during onboarding', ?, ?)
          `).run(portId, tenantId, now, now);

          // Sample vendor contact
          const vendorId = generateUUIDv7();
          tx.prepare(`
            INSERT INTO contacts (id, tenant_id, contact_type, first_name, last_name, company_name, email, phone, vendor_specialty, created_at, updated_at)
            VALUES (?, ?, 'vendor', 'Marcus', 'Vance', 'Apex Plumbing Services', 'marcus@apexplumb.local', '(555) 301-4401', 'Plumbing', ?, ?)
          `).run(vendorId, tenantId, now, now);

          // Sample property & unit
          const propId = generateUUIDv7();
          tx.prepare(`
            INSERT INTO properties (id, tenant_id, portfolio_id, name, property_type, address_line1, city, state, postal_code, created_at, updated_at)
            VALUES (?, ?, ?, '104 Oakwood Drive', 'single_family', '104 Oakwood Dr', 'Asheville', 'NC', '28801', ?, ?)
          `).run(propId, tenantId, portId, now, now);

          const unitId = generateUUIDv7();
          tx.prepare(`
            INSERT INTO units (id, tenant_id, property_id, unit_number, status, bedrooms, bathrooms, square_feet, market_rent_cents, target_deposit_cents, created_at, updated_at)
            VALUES (?, ?, ?, 'Main', 'vacant', 3, 2, 1450, 185000, 185000, ?, ?)
          `).run(unitId, tenantId, propId, now, now);
        }
      }, db);

      const token = createToken(
        {
          sub: userId,
          tid: tenantId,
          role: 'owner',
          exp: Math.floor(Date.now() / 1000) + 86400,
          tv: 1
        },
        APP_SECRET
      );

      successResponse(res, {
        token,
        user: {
          id: userId,
          tenant_id: tenantId,
          email: cleanEmail,
          first_name: cleanFirst,
          last_name: cleanLast,
          role: 'owner'
        }
      }, 201);
    } catch (err: any) {
      errorResponse(res, 'SETUP_FAILED', `Failed to initialize system: ${err.message}`, 500);
    }
  });

  // System Setup: Restore from Backup
  router.post('/api/v1/system/restore', async (req, res) => {
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL').get() as { count: number };
    if (Number(countRow?.count || 0) > 0) {
      return errorResponse(res, 'ALREADY_CONFIGURED', 'System is already configured. Restore via initial setup is unavailable.', 403);
    }

    const { backup_data, filename } = req.body || {};
    if (!backup_data || typeof backup_data !== 'string') {
      return errorResponse(res, 'VALIDATION_ERROR', 'Backup data payload is required (base64 encoded)', 400);
    }

    const cleanFilename = typeof filename === 'string' ? filename : 'restore-backup.sqlite.gz';
    const buffer = Buffer.from(backup_data, 'base64');
    if (buffer.length === 0) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Backup payload is empty', 400);
    }

    // Dynamic check for backup module service
    try {
      const backupServiceMod = await import('../modules/backup/backend/service.js').catch(() => null);
      if (!backupServiceMod || !backupServiceMod.BackupService) {
        return errorResponse(res, 'BACKUP_MODULE_NOT_AVAILABLE', 'The backup module is not loaded on this server', 400);
      }

      const tempDir = process.env['STORAGE_PATH'] ? path.resolve(process.env['STORAGE_PATH']) : path.resolve('./storage');
      fs.mkdirSync(tempDir, { recursive: true });
      const tempRestoreFile = path.join(tempDir, `initial-restore-${Date.now()}-${cleanFilename}`);
      fs.writeFileSync(tempRestoreFile, buffer);

      try {
        await backupServiceMod.BackupService.restoreFullDatabase(tempRestoreFile);
      } finally {
        if (fs.existsSync(tempRestoreFile)) {
          try { fs.unlinkSync(tempRestoreFile); } catch {}
        }
      }

      // Re-verify after restore
      const postDb = getDatabase();
      const postCountRow = postDb.prepare('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL').get() as { count: number };
      const restoredUserCount = Number(postCountRow?.count || 0);

      if (restoredUserCount === 0) {
        return errorResponse(res, 'RESTORE_EMPTY', 'Restoration completed but no active users were found in the restored database', 400);
      }

      successResponse(res, {
        message: 'Database successfully restored from backup snapshot',
        users_restored: restoredUserCount
      });
    } catch (err: any) {
      errorResponse(res, 'RESTORE_FAILED', `Failed to restore database from backup: ${err.message}`, 500);
    }
  });

  return router;
}

/**
 * Start the loopback API server after validating runtime configuration.
 *
 * @param port TCP port for the API engine.
 * @param host Binding address, restricted to loopback by default.
 * @returns The HTTP server and configured router.
 */
export async function startServer(
  port: number = PORT,
  host: string = HOST
): Promise<{ server: HttpServer; router: Router }> {
  validateEnvironment(NODE_ENV, process.env['APP_SECRET']);

  const router = createRouter(port);

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
