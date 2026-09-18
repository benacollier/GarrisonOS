import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { handle, renderAdminPage } from '../pages/admin.js';
import { WebRouter } from '../router.js';
import { Session } from '../lib/session.js';
import { ApiClient } from '../lib/api-client.js';
import { PageContext } from '../lib/page-context.js';
import { getDatabase, closeDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrator.js';
import { generateUUIDv7 } from '../../core/crypto.js';
import { eventBus } from '../../core/events.js';

function createMockContext(path: string, options?: {
  user?: any;
  method?: string;
}): { ctx: PageContext; res: ServerResponse; getOutput: () => string } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options?.method || 'GET';
  req.url = path;

  const res = new ServerResponse(req);
  let output = '';

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  res.write = function (chunk: any, ...args: any[]) {
    if (chunk) output += chunk.toString();
    return (origWrite as any)(chunk, ...args);
  };

  res.end = function (chunk?: any, ...args: any[]) {
    if (chunk) output += chunk.toString();
    return (origEnd as any)(chunk, ...args);
  };

  const session = new Session();
  if (options?.user) {
    session.user = options.user;
    session.authToken = 'test-token';
  }

  const api = new ApiClient();
  (api as any).get = async (apiPath: string) => {
    if (apiPath === '/api/v1/system/status') {
      return { success: true, data: { is_configured: true } };
    }
    return { success: true, data: {} };
  };

  const url = new URL(`http://localhost:8080${path}`);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  const ctx: PageContext = {
    req,
    res,
    api,
    session,
    url,
    query,
    body: {},
    method: req.method || 'GET'
  };

  return { ctx, res, getOutput: () => output };
}

describe('Admin Management GUI Suite', () => {
  let db: any;
  const operatorId = generateUUIDv7();

  before(() => {
    db = getDatabase({ inMemory: true });
    runMigrations(db);

    const now = Date.now();
    db.prepare(`
      INSERT INTO operators (id, name, storage_quota_bytes, created_at, updated_at)
      VALUES (?, 'Admin Test Operator', 50000000, ?, ?)
    `).run(operatorId, now, now);

    db.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, created_at, updated_at)
      VALUES
        ('owner-admin-1', ?, 'owner@admintest.local', 'hash', 'Platform', 'Owner', 'owner', ?, ?),
        ('viewer-admin-1', ?, 'viewer@admintest.local', 'hash', 'Casual', 'Viewer', 'viewer', ?, ?)
    `).run(operatorId, now, now, operatorId, now, now);
  });

  after(() => {
    closeDatabase();
  });

  it('renderAdminPage generates valid HTML containing health telemetry', () => {
    const rendered = renderAdminPage({
      activeOperatorsCount: 3,
      activeUsersCount: 12,
      storageUsedBytes: 15728640,
      storageQuotaBytes: 104857600,
      uptimeSeconds: 7200,
      nodeVersion: process.version,
      cpuUsageMs: { user: 250, system: 50 },
      dbStatus: 'healthy',
      memoryUsageMb: { rss: 64, heapTotal: 32, heapUsed: 24 },
      rateLimitStats: {
        activeBuckets: 4,
        totalBlocks: 2,
        recentEvents: [
          { key: 'ratelimit:public:127.0.0.1', timestamp: Date.now(), path: '/api/v1/auth/login' }
        ]
      },
      deadLetterFailures: [
        {
          id: 'dl-1',
          event: 'payment.recorded',
          error: 'Webhook connection timeout',
          operatorId,
          timestamp: Date.now()
        }
      ],
      failedBackups: [
        {
          id: 'fb-1',
          filename: 'snapshot-err.sqlite.gz',
          error_message: 'Disk full during vacuum',
          created_at: Date.now()
        }
      ],
      loadedModules: [
        {
          id: 'accounting',
          name: 'General Ledger',
          version: '0.1.0',
          description: 'Double-entry accounting module',
          dependencies: []
        }
      ]
    });

    const htmlString = typeof rendered === 'string' ? rendered : rendered.value;
    assert.match(htmlString, /System Administration & Governance/);
    assert.match(htmlString, /Active Operators/);
    assert.match(htmlString, /Storage Consumption/);
    assert.match(htmlString, /System Uptime & CPU/);
    assert.match(htmlString, /CPU: 300ms/);
    assert.match(htmlString, /Rate Limiter Activity/);
    assert.match(htmlString, /Webhook connection timeout/);
    assert.match(htmlString, /Disk full during vacuum/);
    assert.match(htmlString, /General Ledger/);
  });

  it('handle returns 403 Forbidden for non-owner role', async () => {
    const { ctx } = createMockContext('/admin', {
      user: { id: 'viewer-admin-1', role: 'viewer', first_name: 'Casual', last_name: 'Viewer', operator_id: operatorId }
    });

    const result = await handle(ctx);
    assert.equal(result.status, 403);
    assert.equal(result.title, '403 Forbidden');
    const contentStr = typeof result.content === 'string' ? result.content : result.content.value;
    assert.match(contentStr, /403 Forbidden/);
  });

  it('handle renders admin dashboard successfully for owner role', async () => {
    const { ctx } = createMockContext('/admin', {
      user: { id: 'owner-admin-1', role: 'owner', first_name: 'Platform', last_name: 'Owner', operator_id: operatorId }
    });

    const result = await handle(ctx);
    assert.equal(result.title, 'Platform Administration');
    const contentStr = typeof result.content === 'string' ? result.content : result.content.value;
    assert.match(contentStr, /System Administration & Governance/);
    assert.match(contentStr, /Dynamic Module Inspector/);
  });

  it('WebRouter dispatches /admin and renders full layout for authorized owner', async () => {
    const { ctx, res, getOutput } = createMockContext('/admin', {
      user: { id: 'owner-admin-1', role: 'owner', first_name: 'Platform', last_name: 'Owner', operator_id: operatorId }
    });

    await WebRouter.dispatch(ctx);
    assert.equal(res.statusCode, 200);
    const output = getOutput();
    assert.match(output, /Platform Administration/);
    assert.match(output, /GarrisonOS/);
  });
});
