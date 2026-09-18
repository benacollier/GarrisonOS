import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireRole
} from '../../api/middleware.js';
import { RequestContext } from '../../core/context.js';
import { createTestDb } from '../helpers.js';
import { closeDatabase } from '../../database/client.js';

class MockRequest extends EventEmitter {
  public method: string;
  public path: string;
  public headers: Record<string, string>;
  public operatorId?: string;
  public userId?: string;
  public correlationId?: string;
  public socket = { remoteAddress: '127.0.0.1' };

  constructor(method = 'GET', path = '/', headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.path = path;
    this.headers = headers;
  }
}

class MockResponse {
  public headers: Record<string, string> = {};
  public statusCode = 200;
  public body = '';
  public writableEnded = false;

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
  }

  public writeHead(statusCode: number, headers?: Record<string, any>): void {
    this.statusCode = statusCode;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this.headers[k.toLowerCase()] = String(v);
      }
    }
  }

  public end(chunk?: any): void {
    if (chunk) {
      this.body += typeof chunk === 'string' ? chunk : chunk.toString();
    }
    this.writableEnded = true;
  }
}

describe('RBAC Middleware Suite', () => {
  let db: any;
  const operatorId = 'op-rbac-test-1';
  const ownerUserId = 'user-owner-1';
  const managerUserId = 'user-manager-1';
  const viewerUserId = 'user-viewer-1';

  before(() => {
    db = createTestDb();
    const now = Date.now();

    db.prepare(`
      INSERT INTO operators (id, name, created_at, updated_at)
      VALUES (?, 'RBAC Test Operator', ?, ?)
    `).run(operatorId, now, now);

    db.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, created_at, updated_at)
      VALUES
        (?, ?, 'owner@rbac.local', '$scrypt$dummy', 'Owner', 'User', 'owner', ?, ?),
        (?, ?, 'manager@rbac.local', '$scrypt$dummy', 'Manager', 'User', 'manager', ?, ?),
        (?, ?, 'viewer@rbac.local', '$scrypt$dummy', 'Viewer', 'User', 'viewer', ?, ?)
    `).run(
      ownerUserId, operatorId, now, now,
      managerUserId, operatorId, now, now,
      viewerUserId, operatorId, now, now
    );
  });

  after(() => {
    closeDatabase();
  });

  it('requirePermission allows authorized user through', async () => {
    const req = new MockRequest('POST', '/api/v1/properties');
    req.operatorId = operatorId;
    req.userId = managerUserId;
    const res = new MockResponse();

    let nextCalled = false;
    const middleware = requirePermission('properties:create');

    await RequestContext.run({ operatorId, userId: managerUserId, correlationId: 'test-corr' }, async () => {
      await middleware(req as any, res as any, async () => {
        nextCalled = true;
      });
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it('requirePermission blocks user missing permission with 403 FORBIDDEN', async () => {
    const req = new MockRequest('POST', '/api/v1/properties');
    req.operatorId = operatorId;
    req.userId = viewerUserId;
    const res = new MockResponse();

    let nextCalled = false;
    const middleware = requirePermission('properties:create');

    await RequestContext.run({ operatorId, userId: viewerUserId, correlationId: 'test-corr' }, async () => {
      await middleware(req as any, res as any, async () => {
        nextCalled = true;
      });
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error.code, 'FORBIDDEN');
    assert.match(parsed.error.message, /properties:create/);
  });

  it('requireAllPermissions requires all permissions to be granted', async () => {
    const req = new MockRequest('POST', '/api/v1/accounting/transact');
    req.operatorId = operatorId;
    req.userId = managerUserId;
    const res = new MockResponse();

    let nextCalled = false;
    // manager has properties:view and accounting:transact, but NOT system:admin
    const middleware = requireAllPermissions(['properties:view', 'accounting:transact', 'system:admin']);

    await RequestContext.run({ operatorId, userId: managerUserId, correlationId: 'test-corr' }, async () => {
      await middleware(req as any, res as any, async () => {
        nextCalled = true;
      });
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it('requireAnyPermission allows access if at least one permission matches', async () => {
    const req = new MockRequest('GET', '/api/v1/properties');
    req.operatorId = operatorId;
    req.userId = viewerUserId;
    const res = new MockResponse();

    let nextCalled = false;
    // viewer has properties:view, but NOT properties:create
    const middleware = requireAnyPermission(['properties:create', 'properties:view']);

    await RequestContext.run({ operatorId, userId: viewerUserId, correlationId: 'test-corr' }, async () => {
      await middleware(req as any, res as any, async () => {
        nextCalled = true;
      });
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it('requireRole verifies exact role match', async () => {
    const req = new MockRequest('GET', '/admin');
    req.operatorId = operatorId;
    req.userId = ownerUserId;
    const res = new MockResponse();

    let nextCalled = false;
    const middleware = requireRole('owner');

    await RequestContext.run({ operatorId, userId: ownerUserId, correlationId: 'test-corr' }, async () => {
      await middleware(req as any, res as any, async () => {
        nextCalled = true;
      });
    });

    assert.equal(nextCalled, true);

    // Now test with viewer role
    const req2 = new MockRequest('GET', '/admin');
    req2.operatorId = operatorId;
    req2.userId = viewerUserId;
    const res2 = new MockResponse();

    let nextCalled2 = false;
    await RequestContext.run({ operatorId, userId: viewerUserId, correlationId: 'test-corr' }, async () => {
      await middleware(req2 as any, res2 as any, async () => {
        nextCalled2 = true;
      });
    });

    assert.equal(nextCalled2, false);
    assert.equal(res2.statusCode, 403);
  });
});
