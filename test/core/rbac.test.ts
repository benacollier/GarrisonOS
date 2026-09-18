import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase, closeDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrator.js';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  matchesPermission,
  getRolePermissions,
  loadOperatorRoleOverrides,
  checkUserPermission
} from '../../core/rbac.js';
import { generateUUIDv7 } from '../../core/crypto.js';

test('RBAC: permission pattern matching', () => {
  assert.equal(matchesPermission('*', 'properties:view'), true);
  assert.equal(matchesPermission('*:*', 'leases:create'), true);
  assert.equal(matchesPermission('properties:*', 'properties:view'), true);
  assert.equal(matchesPermission('properties:*', 'properties:create'), true);
  assert.equal(matchesPermission('properties:*', 'leases:create'), false);
  assert.equal(matchesPermission('*:view', 'leases:view'), true);
  assert.equal(matchesPermission('*:view', 'leases:create'), false);
  assert.equal(matchesPermission('leases:renew', 'leases:renew'), true);
  assert.equal(matchesPermission('leases:renew', 'leases:terminate'), false);
  assert.equal(matchesPermission('invalid', 'properties:view'), false);
});

test('RBAC: canonical role permission evaluations', () => {
  // Owner has unrestricted permissions
  assert.equal(hasPermission('owner', 'properties:create'), true);
  assert.equal(hasPermission('owner', 'system:admin'), true);
  assert.equal(hasPermission('owner', 'system:operators'), true);

  // Manager has broad operations but not platform system admin
  assert.equal(hasPermission('manager', 'properties:create'), true);
  assert.equal(hasPermission('manager', 'leases:renew'), true);
  assert.equal(hasPermission('manager', 'accounting:transact'), true);
  assert.equal(hasPermission('manager', 'system:backup'), true);
  assert.equal(hasPermission('manager', 'system:admin'), false);
  assert.equal(hasPermission('manager', 'system:operators'), false);

  // Maintenance has maintenance operations and view access
  assert.equal(hasPermission('maintenance', 'maintenance:dispatch'), true);
  assert.equal(hasPermission('maintenance', 'maintenance:complete'), true);
  assert.equal(hasPermission('maintenance', 'properties:view'), true);
  assert.equal(hasPermission('maintenance', 'attachments:upload'), true);
  assert.equal(hasPermission('maintenance', 'leases:create'), false);
  assert.equal(hasPermission('maintenance', 'accounting:transact'), false);

  // Auditor has view and reconcile permissions
  assert.equal(hasPermission('auditor', 'accounting:view'), true);
  assert.equal(hasPermission('auditor', 'accounting:reconcile'), true);
  assert.equal(hasPermission('auditor', 'leases:view'), true);
  assert.equal(hasPermission('auditor', 'accounting:transact'), false);
  assert.equal(hasPermission('auditor', 'properties:create'), false);

  // Viewer has view-only permissions
  assert.equal(hasPermission('viewer', 'properties:view'), true);
  assert.equal(hasPermission('viewer', 'leases:view'), true);
  assert.equal(hasPermission('viewer', 'accounting:view'), true);
  assert.equal(hasPermission('viewer', 'properties:create'), false);
  assert.equal(hasPermission('viewer', 'maintenance:create'), false);

  // Unknown role has no permissions
  assert.equal(hasPermission('unknown_role', 'properties:view'), false);
});

test('RBAC: composite permissions (hasAllPermissions & hasAnyPermission)', () => {
  assert.equal(
    hasAllPermissions('manager', ['properties:view', 'leases:create', 'accounting:view']),
    true
  );
  assert.equal(
    hasAllPermissions('manager', ['properties:view', 'system:admin']),
    false
  );

  assert.equal(
    hasAnyPermission('viewer', ['properties:create', 'properties:view']),
    true
  );
  assert.equal(
    hasAnyPermission('viewer', ['properties:create', 'system:admin']),
    false
  );
});

test('RBAC: custom role overrides (programmatic and database)', () => {
  const customOverrides = {
    contractor: ['maintenance:view', 'maintenance:complete'],
    viewer: ['properties:view', 'properties:create'] // elevated viewer override
  };

  assert.equal(hasPermission('contractor', 'maintenance:complete', customOverrides), true);
  assert.equal(hasPermission('contractor', 'maintenance:dispatch', customOverrides), false);
  assert.equal(hasPermission('viewer', 'properties:create', customOverrides), true);

  // Database-backed role overrides
  const db = getDatabase({ inMemory: true });
  runMigrations(db);

  const operatorId = generateUUIDv7();
  db.prepare(`
    INSERT INTO operators (id, name, created_at, updated_at)
    VALUES (?, 'Test Operator', ?, ?)
  `).run(operatorId, Date.now(), Date.now());

  db.prepare(`
    INSERT INTO role_permissions (id, operator_id, role, permission, created_at)
    VALUES (?, ?, 'auditor', 'accounting:transact', ?)
  `).run(generateUUIDv7(), operatorId, Date.now());

  const dbOverrides = loadOperatorRoleOverrides(operatorId, db);
  assert.deepEqual(dbOverrides['auditor'], ['accounting:transact']);
  assert.equal(hasPermission('auditor', 'accounting:transact', dbOverrides), true);

  // User permission check
  const userId = generateUUIDv7();
  db.prepare(`
    INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, created_at, updated_at)
    VALUES (?, ?, 'custom@user.local', 'hash', 'Test', 'User', 'auditor', ?, ?)
  `).run(userId, operatorId, Date.now(), Date.now());

  assert.equal(checkUserPermission(userId, operatorId, 'accounting:transact', db), true);

  closeDatabase();
});
