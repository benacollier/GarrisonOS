import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRouter } from '../../api/server.js';
import { createTestDb } from '../helpers.js';
import { getDatabase } from '../../database/client.js';
import { createToken } from '../../core/crypto.js';

class MockIncomingMessage extends EventEmitter {
  public method: string;
  public url: string;
  public headers: Record<string, string>;
  public socket: any = { remoteAddress: '127.0.0.1' };

  constructor(method: string, url: string, body?: any, headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: '127.0.0.1:3000', 'content-type': 'application/json', ...headers };

    if (body !== undefined) {
      process.nextTick(() => {
        this.emit('data', Buffer.from(JSON.stringify(body)));
        this.emit('end');
      });
    } else {
      process.nextTick(() => {
        this.emit('end');
      });
    }
  }
}

class MockServerResponse {
  public statusCode = 200;
  public headers: Record<string, string> = {};
  public body = '';
  public writableEnded = false;

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
  }

  public writeHead(statusCode: number, headers: Record<string, string> = {}): void {
    this.statusCode = statusCode;
    for (const [k, v] of Object.entries(headers)) {
      this.headers[k.toLowerCase()] = v;
    }
  }

  public end(chunk?: string): void {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }

  public json(): any {
    try {
      return JSON.parse(this.body);
    } catch {
      return null;
    }
  }
}

describe('System Operator Provisioning & Governance API', () => {
  const secret = process.env['APP_SECRET'] || 'garrison-os-development-secret';
  const originalRoutingMode = process.env['OPERATOR_ROUTING_MODE'];
  let existingOperatorId: string;
  let ownerToken: string;
  let managerToken: string;

  afterEach(() => {
    if (originalRoutingMode !== undefined) {
      process.env['OPERATOR_ROUTING_MODE'] = originalRoutingMode;
    } else {
      delete process.env['OPERATOR_ROUTING_MODE'];
    }
  });

  beforeEach(() => {
    const db = createTestDb();
    const now = Date.now();
    existingOperatorId = 'existing-operator-1';

    db.prepare(`
      INSERT INTO operators (id, name, subdomain, currency, storage_quota_bytes, created_at, updated_at)
      VALUES (?, 'Existing Operator LLC', 'existing', 'USD', 21474836480, ?, ?)
    `).run(existingOperatorId, now, now);

    db.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, token_version, created_at, updated_at)
      VALUES
        ('owner-1', ?, 'admin@existing.local', '$scrypt$dummy', 'Admin', 'Owner', 'owner', 1, ?, ?),
        ('manager-1', ?, 'manager@existing.local', '$scrypt$dummy', 'Manager', 'User', 'manager', 1, ?, ?)
    `).run(existingOperatorId, now, now, existingOperatorId, now, now);

    ownerToken = createToken({
      sub: 'owner-1',
      opid: existingOperatorId,
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);

    managerToken = createToken({
      sub: 'manager-1',
      opid: existingOperatorId,
      role: 'manager',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);
  });

  it('rejects unauthenticated operator provisioning requests with 403', async () => {
    const router = createRouter();
    const req = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Acme Properties',
      email: 'alex@acmeprops.local',
      password: 'Password123!'
    }) as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 403);
    const body = res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('rejects operator provisioning requests from tenant users (including owners) without platform credentials with 403', async () => {
    const router = createRouter();

    // Manager token rejected
    const req1 = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Acme Properties',
      email: 'alex@acmeprops.local',
      password: 'Password123!'
    }, {
      authorization: `Bearer ${managerToken}`,
      'x-operator-id': existingOperatorId
    }) as any;
    const res1 = new MockServerResponse() as any;
    await router.handle(req1, res1);
    assert.equal(res1.statusCode, 403);
    assert.equal(res1.json().error.code, 'FORBIDDEN');

    // Owner token from an existing operator without platform APP_SECRET is ALSO rejected
    const req2 = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Rogue Spinoff Co',
      email: 'rogue@spinoff.local',
      password: 'Password123!'
    }, {
      authorization: `Bearer ${ownerToken}`,
      'x-operator-id': existingOperatorId
    }) as any;
    const res2 = new MockServerResponse() as any;
    await router.handle(req2, res2);
    assert.equal(res2.statusCode, 403);
    assert.equal(res2.json().error.code, 'FORBIDDEN');
  });

  it('provisions operator successfully via platform secret and persists custom storage quota', async () => {
    const router = createRouter();
    const customQuota = 53687091200; // 50 GB
    const req = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Highland Peak Property Management',
      email: 'sarah@highlandpeak.local',
      password: 'StrongPassword2026!',
      storage_quota_bytes: customQuota,
      first_name: 'Sarah',
      last_name: 'Connor'
    }, {
      'x-app-secret': secret
    }) as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.operator.id);
    assert.equal(body.data.operator.name, 'Highland Peak Property Management');
    assert.equal(body.data.operator.storage_quota_bytes, customQuota);
    assert.equal(body.data.user.email, 'sarah@highlandpeak.local');
    assert.equal(body.data.user.role, 'owner');

    // Verify database persistence of operator and quota
    const db = getDatabase();
    const opRow = db.prepare('SELECT * FROM operators WHERE id = ?').get(body.data.operator.id) as any;
    assert.ok(opRow);
    assert.equal(opRow.name, 'Highland Peak Property Management');
    assert.equal(opRow.storage_quota_bytes, customQuota);

    // Verify default Chart of Accounts was seeded for this new operator
    const coaCount = db.prepare(
      'SELECT COUNT(*) as count FROM chart_of_accounts WHERE operator_id = ? AND deleted_at IS NULL'
    ).get(body.data.operator.id) as { count: number };
    assert.ok(coaCount.count >= 6, `Expected at least 6 accounts seeded, found ${coaCount.count}`);

    // Verify audit log recorded
    const audit = db.prepare(
      'SELECT * FROM audit_logs WHERE operator_id = ? AND entity_type = ?'
    ).get(body.data.operator.id, 'system') as any;
    assert.ok(audit);
  });

  it('provisions operator via APP_SECRET handshake and defaults storage quota to 10GB', async () => {
    const router = createRouter();
    const req = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Default Quota Operator',
      email: 'admin@defaultquota.local',
      password: 'SecurePassword123!'
    }, {
      'x-app-secret': secret
    }) as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.success, true);
    const default10GB = 10737418240;
    assert.equal(body.data.operator.storage_quota_bytes, default10GB);

    const db = getDatabase();
    const opRow = db.prepare('SELECT * FROM operators WHERE id = ?').get(body.data.operator.id) as any;
    assert.equal(opRow.storage_quota_bytes, default10GB);
  });

  it('rolls back atomic transaction when contact email already exists', async () => {
    const router = createRouter();
    const duplicateName = 'Duplicate Email Operator';

    const req = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: duplicateName,
      email: 'admin@existing.local', // Already registered under existing operator in beforeEach
      password: 'SecurePassword123!'
    }, {
      'x-app-secret': secret
    }) as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 409);
    const body = res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CONFLICT');

    // Transaction Rollback Check: Verify operator was NOT inserted into database
    const db = getDatabase();
    const opRow = db.prepare('SELECT * FROM operators WHERE name = ?').get(duplicateName);
    assert.equal(opRow, undefined, 'Operator should not exist due to atomic rollback');

    // Verify no orphaned chart of accounts records were left behind
    const orphanCoa = db.prepare(`
      SELECT COUNT(*) as count FROM chart_of_accounts
      WHERE operator_id NOT IN (SELECT id FROM operators)
    `).get() as { count: number };
    assert.equal(orphanCoa.count, 0, 'No orphaned Chart of Accounts records should exist');
  });

  it('validates invalid storage quota inputs and password lengths', async () => {
    const router = createRouter();

    // Invalid negative quota
    const req1 = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Invalid Quota Corp',
      email: 'test@invalid.local',
      password: 'Password123!',
      storage_quota_bytes: -100
    }, {
      'x-app-secret': secret
    }) as any;
    const res1 = new MockServerResponse() as any;
    await router.handle(req1, res1);
    assert.equal(res1.statusCode, 400);

    // Short password (<8 chars)
    const req2 = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Short Password Corp',
      email: 'short@password.local',
      password: 'short'
    }, {
      'x-app-secret': secret
    }) as any;
    const res2 = new MockServerResponse() as any;
    await router.handle(req2, res2);
    assert.equal(res2.statusCode, 400);
  });

  it('verifies end-to-end operator login and operational isolation with newly provisioned credentials', async () => {
    const router = createRouter();

    // 1. Provision new operator
    const provReq = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Summit Real Estate Partners',
      email: 'founder@summitprops.local',
      password: 'FounderPassword2026!'
    }, {
      'x-app-secret': secret
    }) as any;
    const provRes = new MockServerResponse() as any;
    await router.handle(provReq, provRes);
    assert.equal(provRes.statusCode, 201);
    const newOperatorId = provRes.json().data.operator.id;

    // 2. Authenticate as the new operator via /api/v1/auth/login
    const loginReq = new MockIncomingMessage('POST', '/api/v1/auth/login', {
      email: 'founder@summitprops.local',
      password: 'FounderPassword2026!',
      operator_id: newOperatorId
    }) as any;
    const loginRes = new MockServerResponse() as any;
    await router.handle(loginReq, loginRes);

    assert.equal(loginRes.statusCode, 200);
    const loginBody = loginRes.json();
    assert.ok(loginBody.data.token);
    assert.equal(loginBody.data.user.operator_id, newOperatorId);
    assert.equal(loginBody.data.user.role, 'owner');

    // 3. Perform authenticated request with X-Operator-ID and token
    const opReq = new MockIncomingMessage('GET', '/api/v1/modules', undefined, {
      authorization: `Bearer ${loginBody.data.token}`,
      'x-operator-id': newOperatorId
    }) as any;
    const opRes = new MockServerResponse() as any;
    await router.handle(opReq, opRes);

    assert.equal(opRes.statusCode, 200);
    const opBody = opRes.json();
    assert.equal(opBody.success, true);
  });

  it('rejects explicit duplicate subdomain or path slug with 409 CONFLICT', async () => {
    const router = createRouter();

    // 1. Provision operator with explicit subdomain
    const req1 = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Pinnacle Properties',
      subdomain: 'pinnacle',
      email: 'owner@pinnacle.local',
      password: 'Password123!'
    }, {
      'x-app-secret': secret
    }) as any;
    const res1 = new MockServerResponse() as any;
    await router.handle(req1, res1);
    assert.equal(res1.statusCode, 201);

    // 2. Attempt duplicate subdomain
    const req2 = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Another Pinnacle Entity',
      subdomain: 'pinnacle',
      email: 'other@pinnacle.local',
      password: 'Password123!'
    }, {
      'x-app-secret': secret
    }) as any;
    const res2 = new MockServerResponse() as any;
    await router.handle(req2, res2);

    assert.equal(res2.statusCode, 409);
    const body2 = res2.json();
    assert.equal(body2.success, false);
    assert.equal(body2.error.code, 'CONFLICT');
    assert.match(body2.error.message, /Subdomain or path 'pinnacle' is already in use/);
  });

  it('automatically disambiguates auto-generated subdomain on duplicate names', async () => {
    const router = createRouter();

    // 1. Provision first operator
    const req1 = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Maplewood Management',
      email: 'owner1@maplewood.local',
      password: 'Password123!'
    }, {
      'x-app-secret': secret
    }) as any;
    const res1 = new MockServerResponse() as any;
    await router.handle(req1, res1);
    assert.equal(res1.statusCode, 201);
    const sub1 = res1.json().data.operator.subdomain;
    assert.equal(sub1, 'maplewood-management');

    // 2. Provision second operator with same name but distinct email (auto-disambiguates)
    const req2 = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Maplewood Management',
      email: 'owner2@maplewood.local',
      password: 'Password123!'
    }, {
      'x-app-secret': secret
    }) as any;
    const res2 = new MockServerResponse() as any;
    await router.handle(req2, res2);
    assert.equal(res2.statusCode, 201);
    const sub2 = res2.json().data.operator.subdomain;
    assert.notEqual(sub1, sub2);
    assert.match(sub2, /^maplewood-management-[0-9a-f]{4}$/);
  });

  it('resolves operator context via path-based routing (/o/:slug/...)', async () => {
    process.env['OPERATOR_ROUTING_MODE'] = 'both';
    const router = createRouter();

    // Provision operator with custom path slug
    const provReq = new MockIncomingMessage('POST', '/api/v1/system/operators', {
      name: 'Path Route Realty',
      slug: 'path-realty',
      email: 'path@realty.local',
      password: 'PathPassword123!'
    }, {
      'x-app-secret': secret
    }) as any;
    const provRes = new MockServerResponse() as any;
    await router.handle(provReq, provRes);
    assert.equal(provRes.statusCode, 201);
    const opId = provRes.json().data.operator.id;

    // Login to get token
    const loginReq = new MockIncomingMessage('POST', '/api/v1/auth/login', {
      email: 'path@realty.local',
      password: 'PathPassword123!',
      operator_id: opId
    }) as any;
    const loginRes = new MockServerResponse() as any;
    await router.handle(loginReq, loginRes);
    assert.equal(loginRes.statusCode, 200);
    const token = loginRes.json().data.token;

    // Call API using path prefix /o/path-realty/api/v1/modules WITHOUT X-Operator-ID header
    const pathReq = new MockIncomingMessage('GET', '/o/path-realty/api/v1/modules', undefined, {
      authorization: `Bearer ${token}`
    }) as any;
    const pathRes = new MockServerResponse() as any;
    await router.handle(pathReq, pathRes);

    assert.equal(pathRes.statusCode, 200);
    assert.equal(pathRes.json().success, true);
  });
});
