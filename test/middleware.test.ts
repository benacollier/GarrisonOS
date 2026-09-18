import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { resolveCorsOrigin, securityHeadersMiddleware, operatorContextMiddleware } from '../api/middleware.js';
import { createToken } from '../core/crypto.js';
import { RequestContext } from '../core/context.js';
import { createTestDb } from './helpers.js';
import { closeDatabase } from '../database/client.js';

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

describe('Security middleware CORS policy', () => {
  it('echoes only an explicitly allowed origin and falls back safely', () => {
    const allowedOrigins = new Set(['https://app.example', 'https://admin.example']);

    assert.equal(resolveCorsOrigin('https://admin.example', allowedOrigins), 'https://admin.example');
    assert.equal(resolveCorsOrigin('https://evil.example', allowedOrigins), 'https://app.example');
    assert.equal(resolveCorsOrigin(undefined, allowedOrigins), 'https://app.example');
    assert.equal(resolveCorsOrigin('https://evil.example', new Set()), undefined);
  });

  it('never emits a wildcard CORS origin', async () => {
    const request = new MockRequest('GET', '/', { origin: 'https://untrusted.example' });
    const response = new MockResponse();

    await securityHeadersMiddleware(request as any, response as any, async () => {});

    assert.notEqual(response.headers['access-control-allow-origin'], '*');
    assert.equal(response.headers['access-control-allow-methods'], 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    assert.equal(
      response.headers['access-control-allow-headers'],
      'Content-Type, Authorization, X-Operator-ID, X-Request-ID, X-User-ID'
    );
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
  });

  it('does not echo an unconfigured origin', async () => {
    const request = new MockRequest('GET', '/', { origin: 'https://untrusted.example' });
    const response = new MockResponse();

    await securityHeadersMiddleware(request as any, response as any, async () => {});

    assert.notEqual(response.headers['access-control-allow-origin'], 'https://untrusted.example');
    assert.notEqual(response.headers['access-control-allow-origin'], '*');
  });
});

describe('Operator context & authentication middleware', () => {
  const secret = process.env['APP_SECRET'] || 'garrison-os-development-secret';
  let db: any;

  before(() => {
    db = createTestDb();
    const now = Date.now();
    db.prepare(`
      INSERT INTO operators (id, name, subdomain, currency, created_at, updated_at)
      VALUES ('operator-auth-1', 'Auth Test Operator', 'authtest', 'USD', ?, ?)
    `).run(now, now);

    db.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, token_version, created_at, updated_at)
      VALUES
        ('user-owner-1', 'operator-auth-1', 'owner@auth.local', '$scrypt$dummy', 'Owner', 'User', 'owner', 1, ?, ?),
        ('user-manager-1', 'operator-auth-1', 'manager@auth.local', '$scrypt$dummy', 'Manager', 'User', 'manager', 1, ?, ?)
    `).run(now, now, now, now);
  });

  after(() => {
    closeDatabase();
  });

  it('rejects request when X-Operator-ID does not match token operator', async () => {
    const token = createToken({
      sub: 'user-owner-1',
      opid: 'operator-auth-1',
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);

    const req = new MockRequest('GET', '/api/v1/properties', {
      'authorization': `Bearer ${token}`,
      'x-operator-id': 'operator-spoofed'
    });
    const res = new MockResponse();

    let nextCalled = false;
    await operatorContextMiddleware(req as any, res as any, async () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.match(body.error.message, /Operator identity does not match/);
  });

  it('rejects request when X-User-ID header does not match token sub', async () => {
    const token = createToken({
      sub: 'user-owner-1',
      opid: 'operator-auth-1',
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);

    const req = new MockRequest('GET', '/api/v1/properties', {
      'authorization': `Bearer ${token}`,
      'x-operator-id': 'operator-auth-1',
      'x-user-id': 'user-spoofed'
    });
    const res = new MockResponse();

    let nextCalled = false;
    await operatorContextMiddleware(req as any, res as any, async () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.match(body.error.message, /User identity does not match/);
  });

  it('populates RequestContext and passes through when credentials match', async () => {
    const token = createToken({
      sub: 'user-owner-1',
      opid: 'operator-auth-1',
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);

    const req = new MockRequest('GET', '/api/v1/properties', {
      'authorization': `Bearer ${token}`,
      'x-operator-id': 'operator-auth-1',
      'x-user-id': 'user-owner-1'
    });
    const res = new MockResponse();

    let observedOperatorId: string | undefined;
    let observedUserId: string | undefined;

    await operatorContextMiddleware(req as any, res as any, async () => {
      observedOperatorId = RequestContext.getOperatorId();
      observedUserId = RequestContext.getUserId();
    });

    assert.equal(observedOperatorId, 'operator-auth-1');
    assert.equal(observedUserId, 'user-owner-1');
    assert.equal(req.operatorId, 'operator-auth-1');
    assert.equal(req.userId, 'user-owner-1');
  });

  it('rejects operational requests supplying legacy X-Tenant-ID instead of X-Operator-ID', async () => {
    const req = new MockRequest('GET', '/api/v1/properties', {
      'x-tenant-id': 'operator-auth-1'
    });
    const res = new MockResponse();

    let nextCalled = false;
    await operatorContextMiddleware(req as any, res as any, async () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'OPERATOR_REQUIRED');
  });

  it('blocks unauthenticated access to administrator backup endpoint', async () => {
    const req = new MockRequest('GET', '/api/v1/system/backup', {
      'x-operator-id': 'operator-auth-1',
      'x-user-id': 'user-owner-1'
    });
    const res = new MockResponse();

    let nextCalled = false;
    await operatorContextMiddleware(req as any, res as any, async () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('blocks unauthenticated access to the scheduler trigger before its handler runs', async () => {
    const req = new MockRequest('POST', '/api/v1/backups/scheduler/trigger', {
      'x-operator-id': 'operator-auth-1',
      'x-user-id': 'user-owner-1'
    });
    const res = new MockResponse();

    let nextCalled = false;
    await operatorContextMiddleware(req as any, res as any, async () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('blocks non-owner access to administrator backup endpoint', async () => {
    const token = createToken({
      sub: 'user-manager-1',
      opid: 'operator-auth-1',
      role: 'manager',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);

    const req = new MockRequest('GET', '/api/v1/system/backup', {
      'authorization': `Bearer ${token}`,
      'x-operator-id': 'operator-auth-1'
    });
    const res = new MockResponse();

    let nextCalled = false;
    await operatorContextMiddleware(req as any, res as any, async () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('allows owner access to administrator backup endpoint', async () => {
    const token = createToken({
      sub: 'user-owner-1',
      opid: 'operator-auth-1',
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);

    const req = new MockRequest('GET', '/api/v1/system/backup', {
      'authorization': `Bearer ${token}`,
      'x-operator-id': 'operator-auth-1'
    });
    const res = new MockResponse();

    let nextCalled = false;
    await operatorContextMiddleware(req as any, res as any, async () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  it('allows administrative access via APP_SECRET handshake header', async () => {
    const req = new MockRequest('POST', '/api/v1/system/operators', {
      'x-app-secret': secret
    });
    const res = new MockResponse();

    let nextCalled = false;
    await operatorContextMiddleware(req as any, res as any, async () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(req.operatorId, 'system');
    assert.equal(req.userId, 'system');
  });
});
