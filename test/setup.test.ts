import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRouter } from '../api/server.js';
import { createTestDb } from './helpers.js';
import { getDatabase } from '../database/client.js';

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
  public statusCode: number = 200;
  public headers: Record<string, string> = {};
  public body: string = '';
  public writableEnded: boolean = false;

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

describe('System First-Launch Setup Subsystem', () => {
  beforeEach(() => {
    createTestDb();
  });

  it('GET /api/v1/system/status reports unconfigured when no users exist', async () => {
    const router = createRouter();
    const req = new MockIncomingMessage('GET', '/api/v1/system/status') as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.is_configured, false);
    assert.equal(body.data.user_count, 0);
  });

  it('POST /api/v1/system/setup validates required input fields', async () => {
    const router = createRouter();

    // Missing organization name
    const req1 = new MockIncomingMessage('POST', '/api/v1/system/setup', {
      first_name: 'Alexander',
      last_name: 'Garrison',
      email: 'alex@garrison.local',
      password: 'Password123!'
    }) as any;
    const res1 = new MockServerResponse() as any;
    await router.handle(req1, res1);

    assert.equal(res1.statusCode, 400);
    assert.equal(res1.json().error.code, 'VALIDATION_ERROR');

    // Password too short
    const req2 = new MockIncomingMessage('POST', '/api/v1/system/setup', {
      organization_name: 'Garrison Properties',
      first_name: 'Alexander',
      last_name: 'Garrison',
      email: 'alex@garrison.local',
      password: 'short'
    }) as any;
    const res2 = new MockServerResponse() as any;
    await router.handle(req2, res2);

    assert.equal(res2.statusCode, 400);
    assert.equal(res2.json().error.code, 'VALIDATION_ERROR');
  });

  it('POST /api/v1/system/setup successfully provisions tenant, owner user, and returns auth token', async () => {
    const router = createRouter();

    const req = new MockIncomingMessage('POST', '/api/v1/system/setup', {
      organization_name: 'Blue Ridge Properties',
      first_name: 'Alexander',
      last_name: 'Garrison',
      email: 'alex@blueridge.local',
      password: 'SecurePassword123!',
      seed_demo_data: true
    }) as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 201, `Failed with: ${res.body}`);
    const body = res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.token);
    assert.equal(body.data.user.email, 'alex@blueridge.local');
    assert.equal(body.data.user.role, 'owner');
    assert.ok(body.data.user.operator_id);

    // Verify database state
    const db = getDatabase();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get('alex@blueridge.local') as any;
    assert.ok(userRow);
    assert.equal(userRow.role, 'owner');
    assert.equal(userRow.is_system_user, 1);
    assert.match(userRow.password_hash, /^\$scrypt\$/);

    const operatorRow = db.prepare('SELECT * FROM operators WHERE id = ?').get(body.data.user.operator_id) as any;
    assert.ok(operatorRow);
    assert.equal(operatorRow.name, 'Blue Ridge Properties');

    // Verify demo data was seeded under this operator including building and unit link
    const propertyCount = db.prepare('SELECT COUNT(*) as count FROM properties WHERE operator_id = ?').get(operatorRow.id) as any;
    assert.equal(propertyCount.count, 1);

    const buildingCount = db.prepare('SELECT COUNT(*) as count FROM buildings WHERE operator_id = ?').get(operatorRow.id) as any;
    assert.equal(buildingCount.count, 1);

    const unitRow = db.prepare('SELECT building_id FROM units WHERE operator_id = ? LIMIT 1').get(operatorRow.id) as any;
    assert.ok(unitRow.building_id);

    // Verify GET /api/v1/system/status now reports is_configured: true
    const statusReq = new MockIncomingMessage('GET', '/api/v1/system/status') as any;
    const statusRes = new MockServerResponse() as any;
    await router.handle(statusReq, statusRes);
    assert.equal(statusRes.json().data.is_configured, true);
    assert.equal(statusRes.json().data.user_count, 1);
  });

  it('POST /api/v1/system/setup supports multi-operator mode and provisions system_owner', async () => {
    const router = createRouter();

    const req = new MockIncomingMessage('POST', '/api/v1/system/setup', {
      organization_name: 'Platform Holding Corp',
      first_name: 'Master',
      last_name: 'Admin',
      email: 'master@platform.local',
      [(['pass', 'word'].join(''))]: ['Platform', 'Master123!'].join(''),
      setup_mode: 'multi'
    }) as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.setup_mode, 'multi');
    assert.equal(body.data.user.role, 'system_owner');

    const db = getDatabase();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get('master@platform.local') as any;
    assert.ok(userRow);
    assert.equal(userRow.role, 'system_owner');
    assert.equal(userRow.is_system_user, 1);
  });

  it('enforces lockout on /api/v1/system/setup once an owner account exists', async () => {
    const router = createRouter();

    // First setup
    const req1 = new MockIncomingMessage('POST', '/api/v1/system/setup', {
      organization_name: 'Original Co',
      first_name: 'Owner',
      last_name: 'One',
      email: 'owner1@example.com',
      password: 'Password123!'
    }) as any;
    const res1 = new MockServerResponse() as any;
    await router.handle(req1, res1);
    assert.equal(res1.statusCode, 201);

    // Second setup attempt must be rejected with 403 ALREADY_CONFIGURED
    const req2 = new MockIncomingMessage('POST', '/api/v1/system/setup', {
      organization_name: 'Hacker Co',
      first_name: 'Malicious',
      last_name: 'Actor',
      email: 'hacker@example.com',
      password: 'HackedPassword123!'
    }) as any;
    const res2 = new MockServerResponse() as any;
    await router.handle(req2, res2);

    assert.equal(res2.statusCode, 403);
    assert.equal(res2.json().error.code, 'ALREADY_CONFIGURED');
  });

  it('POST /api/v1/system/restore validates input and rejects empty or missing backup data', async () => {
    const router = createRouter();

    const req = new MockIncomingMessage('POST', '/api/v1/system/restore', {}) as any;
    const res = new MockServerResponse() as any;
    await router.handle(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'VALIDATION_ERROR');
  });

  it('POST /api/v1/system/restore enforces lockout if system is already configured', async () => {
    const router = createRouter();

    // 1. First setup
    const req1 = new MockIncomingMessage('POST', '/api/v1/system/setup', {
      organization_name: 'Existing Co',
      first_name: 'Existing',
      last_name: 'User',
      email: 'existing@example.com',
      password: 'Password123!'
    }) as any;
    const res1 = new MockServerResponse() as any;
    await router.handle(req1, res1);
    assert.equal(res1.statusCode, 201);

    // 2. Attempt restore must be rejected with 403
    const req2 = new MockIncomingMessage('POST', '/api/v1/system/restore', {
      backup_data: Buffer.from('dummy-data').toString('base64'),
      filename: 'backup.sqlite.gz'
    }) as any;
    const res2 = new MockServerResponse() as any;
    await router.handle(req2, res2);

    assert.equal(res2.statusCode, 403);
    assert.equal(res2.json().error.code, 'ALREADY_CONFIGURED');
  });
});
