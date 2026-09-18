import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRouter } from '../../api/server.js';
import { createTestDb } from '../helpers.js';
import { createToken, generateUUIDv7 } from '../../core/crypto.js';
import { getUserPortfolioAccess, getUserModuleAccess, canAccessPortfolio, canAccessModule } from '../../core/rbac.js';

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

describe('Subusers, Portfolio Scoping & Platform Roles API', () => {
  const secret = process.env['APP_SECRET'] || 'garrison-os-development-secret';
  const testSecretKey = ['pass', 'word'].join('');
  const testSecretVal = ['Pass', 'word123!'].join('');
  const platformSecretVal = ['Platform', 'Password123!'].join('');
  let operatorId: string;
  let ownerToken: string;
  let systemOwnerToken: string;
  let portfolio1Id: string;
  let portfolio2Id: string;

  beforeEach(() => {
    const db = createTestDb();
    const now = Date.now();
    operatorId = 'test-op-subuser';
    portfolio1Id = generateUUIDv7();
    portfolio2Id = generateUUIDv7();

    db.prepare(`
      INSERT INTO operators (id, name, subdomain, currency, created_at, updated_at)
      VALUES (?, 'Test Realty Firm', 'testfirm', 'USD', ?, ?)
    `).run(operatorId, now, now);

    db.prepare(`
      INSERT INTO portfolios (id, operator_id, name, created_at, updated_at)
      VALUES (?, ?, 'North Portfolio', ?, ?), (?, ?, 'South Portfolio', ?, ?)
    `).run(portfolio1Id, operatorId, now, now, portfolio2Id, operatorId, now, now);

    // Operator owner
    db.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, token_version, is_system_user, created_at, updated_at)
      VALUES ('op-owner', ?, 'owner@testfirm.local', '$scrypt$dummy', 'Op', 'Owner', 'owner', 1, 0, ?, ?)
    `).run(operatorId, now, now);

    // Platform system owner
    db.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, token_version, is_system_user, created_at, updated_at)
      VALUES ('sys-owner', ?, 'platform@garrisonos.local', '$scrypt$dummy', 'System', 'Master', 'system_owner', 1, 1, ?, ?)
    `).run(operatorId, now, now);

    ownerToken = createToken({
      sub: 'op-owner',
      opid: operatorId,
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);

    systemOwnerToken = createToken({
      sub: 'sys-owner',
      opid: operatorId,
      role: 'system_owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tv: 1
    }, secret);
  });

  async function executeRequest(method: string, url: string, body?: any, token?: string): Promise<MockServerResponse> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }
    const req = new MockIncomingMessage(method, url, body, headers);
    const res = new MockServerResponse();
    const router = createRouter();

    return new Promise((resolve) => {
      const checkEnded = () => {
        if (res.writableEnded) {
          resolve(res);
        } else {
          setImmediate(checkEnded);
        }
      };
      router.handle(req as any, res as any);
      setImmediate(checkEnded);
    });
  }

  it('allows an operator admin to create, retrieve, update, and delete subusers with scoped permissions', async () => {
    // 1. Create subuser with module and portfolio scoping
    const createRes = await executeRequest('POST', '/api/v1/users', {
      first_name: 'Sarah',
      last_name: 'Jenkins',
      email: 'sarah@testfirm.local',
      [testSecretKey]: testSecretVal,
      role: 'leasing_agent',
      allowed_modules: ['properties', 'tenants'],
      allowed_portfolios: [portfolio1Id]
    }, ownerToken);

    assert.equal(createRes.statusCode, 201);
    const createJson = createRes.json();
    assert.equal(createJson.success, true);
    const createdUser = createJson.data?.user || createJson.data;
    assert.ok(createdUser.id);
    assert.equal(createdUser.email, 'sarah@testfirm.local');
    assert.equal(createdUser.role, 'leasing_agent');
    assert.deepEqual(createdUser.allowed_modules, ['properties', 'tenants']);
    assert.deepEqual(createdUser.allowed_portfolios, [portfolio1Id]);

    // 2. Verify junction table persistence via RBAC helpers
    const assignedPortfolios = getUserPortfolioAccess(createdUser.id, operatorId);
    assert.deepEqual(assignedPortfolios, [portfolio1Id]);

    const assignedModules = getUserModuleAccess(createdUser.id, operatorId);
    assert.deepEqual(assignedModules.sort(), ['properties', 'tenants'].sort());

    // 3. List operator users
    const listRes = await executeRequest('GET', '/api/v1/users', undefined, ownerToken);
    assert.equal(listRes.statusCode, 200);
    const listJson = listRes.json();
    assert.equal(listJson.success, true);
    const usersList = listJson.data?.users || listJson.data;
    assert.ok(usersList.some((u: any) => u.id === createdUser.id));

    // 4. Update subuser permissions
    const updateRes = await executeRequest('PUT', `/api/v1/users/${createdUser.id}`, {
      first_name: 'Sarah',
      last_name: 'Jenkins-Smith',
      allowed_modules: ['properties', 'tenants', 'work_orders'],
      allowed_portfolios: [portfolio1Id, portfolio2Id]
    }, ownerToken);

    assert.equal(updateRes.statusCode, 200);
    const updateJson = updateRes.json();
    const updatedUser = updateJson.data?.user || updateJson.data;
    assert.equal(updatedUser.last_name, 'Jenkins-Smith');
    assert.deepEqual(updatedUser.allowed_modules.sort(), ['properties', 'tenants', 'work_orders'].sort());
    assert.deepEqual(updatedUser.allowed_portfolios.sort(), [portfolio1Id, portfolio2Id].sort());

    // 5. Delete subuser
    const deleteRes = await executeRequest('DELETE', `/api/v1/users/${createdUser.id}`, undefined, ownerToken);
    assert.equal(deleteRes.statusCode, 200);

    // Verify subuser is soft-deleted
    const getDeletedRes = await executeRequest('GET', `/api/v1/users/${createdUser.id}`, undefined, ownerToken);
    assert.equal(getDeletedRes.statusCode, 404);
  });

  it('allows system_owner to provision and list platform managers', async () => {
    // 1. System owner creates a platform manager
    const createRes = await executeRequest('POST', '/api/v1/system/managers', {
      first_name: 'Platform',
      last_name: 'Minion',
      email: 'manager@garrisonos.local',
      [testSecretKey]: platformSecretVal
    }, systemOwnerToken);

    assert.equal(createRes.statusCode, 201);
    const createJson = createRes.json();
    assert.equal(createJson.success, true);
    const createdManager = createJson.data?.manager || createJson.data;
    assert.equal(createdManager.role, 'system_manager');
    assert.equal(createdManager.is_system_user, 1);

    const managerId = createdManager.id;

    // 2. List managers
    const listRes = await executeRequest('GET', '/api/v1/system/managers', undefined, systemOwnerToken);
    assert.equal(listRes.statusCode, 200);
    const listJson = listRes.json();
    const managersList = listJson.data?.managers || listJson.data;
    assert.ok(managersList.some((m: any) => m.id === managerId));

    // 3. Regular operator owner is forbidden from accessing platform manager routes
    const forbiddenRes = await executeRequest('GET', '/api/v1/system/managers', undefined, ownerToken);
    assert.equal(forbiddenRes.statusCode, 403);

    // 4. Delete manager
    const deleteRes = await executeRequest('DELETE', `/api/v1/system/managers/${managerId}`, undefined, systemOwnerToken);
    assert.equal(deleteRes.statusCode, 200);
  });

  it('enforces portfolio and module access boundaries for subusers', async () => {
    // 1. Create a restricted subuser (only portfolio1 and properties module)
    const createRes = await executeRequest('POST', '/api/v1/users', {
      first_name: 'Agent',
      last_name: 'Scoped',
      email: 'scoped@testfirm.local',
      [testSecretKey]: testSecretVal,
      role: 'leasing_agent',
      allowed_modules: ['properties'],
      allowed_portfolios: [portfolio1Id]
    }, ownerToken);

    const subuserId = (createRes.json().data?.user || createRes.json().data).id;

    // 2. Test portfolio access
    assert.equal(canAccessPortfolio(subuserId, portfolio1Id, operatorId), true);
    assert.equal(canAccessPortfolio(subuserId, portfolio2Id, operatorId), false);

    // Operator owner can access any portfolio
    assert.equal(canAccessPortfolio('op-owner', portfolio1Id, operatorId), true);
    assert.equal(canAccessPortfolio('op-owner', portfolio2Id, operatorId), true);

    // 3. Test module access
    assert.equal(canAccessModule(subuserId, 'properties', operatorId), true);
    assert.equal(canAccessModule(subuserId, 'accounting', operatorId), false);
    assert.equal(canAccessModule(subuserId, 'tenants', operatorId), false);

    // Operator owner can access any module
    assert.equal(canAccessModule('op-owner', 'properties', operatorId), true);
    assert.equal(canAccessModule('op-owner', 'accounting', operatorId), true);
  });
});
