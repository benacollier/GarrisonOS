import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../database/client.js';
import { RequestContext } from './context.js';
import { generateUUIDv7 } from './crypto.js';

/**
 * Canonical system permissions formatted as '<resource>:<action>'.
 */
export type PermissionString =
  | 'properties:view'
  | 'properties:create'
  | 'properties:update'
  | 'properties:delete'
  | 'leases:view'
  | 'leases:create'
  | 'leases:renew'
  | 'leases:terminate'
  | 'accounting:view'
  | 'accounting:transact'
  | 'accounting:disburse'
  | 'accounting:reconcile'
  | 'maintenance:view'
  | 'maintenance:create'
  | 'maintenance:dispatch'
  | 'maintenance:complete'
  | 'contacts:view'
  | 'contacts:create'
  | 'contacts:update'
  | 'contacts:delete'
  | 'attachments:view'
  | 'attachments:upload'
  | 'attachments:delete'
  | 'system:admin'
  | 'system:backup'
  | 'system:operators'
  | string;

/**
 * Standard default permissions mapped to canonical system roles.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // Platform-level roles
  system_owner: Object.freeze(['*']),
  system_manager: Object.freeze([
    'system:admin',
    'system:backup',
    'system:operators:view',
    'operators:view',
    '*:view',
    'properties:*',
    'maintenance:*'
  ]),

  // Operator-level roles
  owner: Object.freeze(['*']),
  manager: Object.freeze([
    'properties:*',
    'leases:*',
    'contacts:*',
    'maintenance:*',
    'accounting:*',
    'attachments:*',
    'system:backup'
  ]),
  leasing_agent: Object.freeze([
    'properties:view',
    'leases:*',
    'contacts:view',
    'contacts:create',
    'contacts:update',
    'attachments:view',
    'attachments:upload'
  ]),
  maintenance: Object.freeze([
    'maintenance:*',
    'properties:view',
    'contacts:view',
    'attachments:view',
    'attachments:upload'
  ]),
  auditor: Object.freeze([
    '*:view',
    'properties:view',
    'leases:view',
    'contacts:view',
    'maintenance:view',
    'accounting:view',
    'accounting:reconcile',
    'attachments:view',
    'system:backup'
  ]),
  viewer: Object.freeze([
    '*:view',
    'properties:view',
    'leases:view',
    'contacts:view',
    'maintenance:view',
    'accounting:view',
    'attachments:view'
  ]),
  // Backward compatibility mappings
  assistant: Object.freeze([
    'properties:view',
    'properties:create',
    'properties:update',
    'leases:view',
    'leases:create',
    'leases:renew',
    'contacts:view',
    'contacts:create',
    'contacts:update',
    'maintenance:view',
    'maintenance:create',
    'maintenance:dispatch',
    'attachments:view',
    'attachments:upload'
  ]),
  read_only: Object.freeze([
    '*:view',
    'properties:view',
    'leases:view',
    'contacts:view',
    'maintenance:view',
    'accounting:view',
    'attachments:view'
  ])
});

/**
 * Checks if a specific granted permission pattern satisfies the required permission.
 * Supports exact matches ('properties:create'), resource wildcards ('properties:*'),
 * action wildcards ('*:view'), and global wildcards ('*', '*:*').
 *
 * @param granted - Granted permission pattern.
 * @param required - Required permission string.
 * @returns True if the granted pattern covers the required permission.
 */
export function matchesPermission(granted: string, required: string): boolean {
  if (granted === '*' || granted === '*:*') {
    return true;
  }
  if (granted === required) {
    return true;
  }

  const [grantedResource, grantedAction] = granted.split(':');
  const [requiredResource, requiredAction] = required.split(':');

  if (!grantedResource || !grantedAction || !requiredResource || !requiredAction) {
    return false;
  }

  const resourceMatch = grantedResource === '*' || grantedResource === requiredResource;
  const actionMatch = grantedAction === '*' || grantedAction === requiredAction;

  return resourceMatch && actionMatch;
}

/**
 * Retrieves the effective permission list for a role, applying operator-level overrides if specified.
 *
 * @param role - User role identifier (e.g. 'owner', 'manager', 'viewer').
 * @param customOverrides - Optional custom role-to-permission mapping dictionary.
 * @returns Set of effective permission patterns.
 */
export function getRolePermissions(
  role: string,
  customOverrides?: Record<string, string[]>
): Set<string> {
  const normalizedRole = role.toLowerCase().trim();

  if (customOverrides && Object.hasOwn(customOverrides, normalizedRole)) {
    return new Set(customOverrides[normalizedRole]);
  }

  if (Object.hasOwn(DEFAULT_ROLE_PERMISSIONS, normalizedRole)) {
    return new Set(DEFAULT_ROLE_PERMISSIONS[normalizedRole]);
  }

  return new Set();
}

/**
 * Loads operator-configured custom role overrides from the database synchronously.
 *
 * @param operatorId - Isolation identifier for the operator.
 * @param dbInstance - Optional DatabaseSync instance.
 * @returns Record mapping role names to custom permission arrays.
 */
export function loadOperatorRoleOverrides(
  operatorId: string,
  dbInstance?: DatabaseSync
): Record<string, string[]> {
  const db = dbInstance || getDatabase();
  const overrides: Record<string, string[]> = {};

  try {
    const rows = db.prepare(
      'SELECT role, permission FROM role_permissions WHERE operator_id = ?'
    ).all(operatorId) as Array<{ role: string; permission: string }>;

    for (const row of rows) {
      const r = row.role.toLowerCase();
      if (!overrides[r]) {
        overrides[r] = [];
      }
      overrides[r]!.push(row.permission);
    }
  } catch {
    // If table doesn't exist yet or query fails, return empty overrides
  }

  return overrides;
}

/**
 * Evaluates whether a role possesses a required permission.
 *
 * @param userRole - Role identifier assigned to the user.
 * @param requiredPermission - Specific permission string to evaluate (e.g. 'leases:renew').
 * @param customOverrides - Optional custom role override mapping.
 * @returns True if role has permission, false otherwise.
 */
export function hasPermission(
  userRole: string,
  requiredPermission: PermissionString,
  customOverrides?: Record<string, string[]>
): boolean {
  const permissions = getRolePermissions(userRole, customOverrides);

  for (const granted of permissions) {
    if (matchesPermission(granted, requiredPermission)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether a role satisfies ALL required permissions.
 *
 * @param userRole - Role identifier assigned to the user.
 * @param permissions - Array of permission strings that must all be granted.
 * @param customOverrides - Optional custom role override mapping.
 * @returns True if all permissions are granted, false otherwise.
 */
export function hasAllPermissions(
  userRole: string,
  permissions: PermissionString[],
  customOverrides?: Record<string, string[]>
): boolean {
  for (const perm of permissions) {
    if (!hasPermission(userRole, perm, customOverrides)) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluates whether a role satisfies AT LEAST ONE of the specified permissions.
 *
 * @param userRole - Role identifier assigned to the user.
 * @param permissions - Array of candidate permission strings.
 * @param customOverrides - Optional custom role override mapping.
 * @returns True if at least one permission is granted, false otherwise.
 */
export function hasAnyPermission(
  userRole: string,
  permissions: PermissionString[],
  customOverrides?: Record<string, string[]>
): boolean {
  for (const perm of permissions) {
    if (hasPermission(userRole, perm, customOverrides)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves the role of the user within the active operator context and evaluates permission.
 *
 * @param userId - Unique user identifier.
 * @param operatorId - Operator isolation identifier.
 * @param requiredPermission - Permission string to verify.
 * @param dbInstance - Optional DatabaseSync instance.
 * @returns True if the user exists and holds the required permission.
 */
export function checkUserPermission(
  userId: string,
  operatorId: string,
  requiredPermission: PermissionString,
  dbInstance?: DatabaseSync
): boolean {
  const db = dbInstance || getDatabase();
  const user = db.prepare(
    'SELECT role FROM users WHERE id = ? AND operator_id = ? AND deleted_at IS NULL'
  ).get(userId, operatorId) as { role: string } | undefined;

  if (!user || !user.role) {
    return false;
  }

  const overrides = loadOperatorRoleOverrides(operatorId, db);
  return hasPermission(user.role, requiredPermission, overrides);
}

/**
 * Checks whether a subuser is authorized to access resources within a specific portfolio.
 * Users with full administrative roles (system_owner, system_manager, owner, manager) have unrestricted access.
 * If a subuser has no portfolio restrictions defined, they have access to all portfolios.
 * Otherwise, the portfolio must be explicitly in their allowed access list.
 *
 * @param userId - Unique user identifier.
 * @param portfolioId - Portfolio identifier to check.
 * @param operatorId - Operator isolation identifier.
 * @param dbInstance - Optional DatabaseSync instance.
 * @returns True if access is permitted, false otherwise.
 */
export function canAccessPortfolio(
  userId: string,
  portfolioId: string,
  operatorId: string,
  dbInstance?: DatabaseSync
): boolean {
  const db = dbInstance || getDatabase();
  const user = db.prepare(
    'SELECT role, is_system_user FROM users WHERE id = ? AND operator_id = ? AND deleted_at IS NULL'
  ).get(userId, operatorId) as { role: string; is_system_user?: number } | undefined;

  if (!user) {
    return false;
  }

  // System and Operator administrative roles have global access across all portfolios
  if (
    user.is_system_user === 1 ||
    user.role === 'system_owner' ||
    user.role === 'system_manager' ||
    user.role === 'owner' ||
    user.role === 'manager'
  ) {
    return true;
  }

  const restrictions = db.prepare(
    'SELECT portfolio_id FROM user_portfolio_access WHERE operator_id = ? AND user_id = ?'
  ).all(operatorId, userId) as Array<{ portfolio_id: string }>;

  // If no specific restrictions configured, subuser has access to all portfolios in the operator
  if (restrictions.length === 0) {
    return true;
  }

  return restrictions.some((r) => r.portfolio_id === portfolioId);
}

/**
 * Checks whether a subuser is permitted to access a specific functional module.
 *
 * @param userId - Unique user identifier.
 * @param moduleId - Module identifier (e.g. 'leases', 'maintenance', 'accounting').
 * @param operatorId - Operator isolation identifier.
 * @param dbInstance - Optional DatabaseSync instance.
 * @returns True if module access is permitted, false otherwise.
 */
export function canAccessModule(
  userId: string,
  moduleId: string,
  operatorId: string,
  dbInstance?: DatabaseSync
): boolean {
  const db = dbInstance || getDatabase();
  const user = db.prepare(
    'SELECT role, is_system_user FROM users WHERE id = ? AND operator_id = ? AND deleted_at IS NULL'
  ).get(userId, operatorId) as { role: string; is_system_user?: number } | undefined;

  if (!user) {
    return false;
  }

  if (
    user.is_system_user === 1 ||
    user.role === 'system_owner' ||
    user.role === 'system_manager' ||
    user.role === 'owner' ||
    user.role === 'manager'
  ) {
    return true;
  }

  const allowedModules = db.prepare(
    'SELECT module_id FROM user_module_access WHERE operator_id = ? AND user_id = ?'
  ).all(operatorId, userId) as Array<{ module_id: string }>;

  // If no explicit module restrictions are configured, access is governed by standard role permissions
  if (allowedModules.length === 0) {
    return true;
  }

  return allowedModules.some((m) => m.module_id === moduleId);
}

/**
 * Retrieves the list of portfolio IDs explicitly assigned to a subuser.
 */
export function getUserPortfolioAccess(
  userId: string,
  operatorId: string,
  dbInstance?: DatabaseSync
): string[] {
  const db = dbInstance || getDatabase();
  const rows = db.prepare(
    'SELECT portfolio_id FROM user_portfolio_access WHERE operator_id = ? AND user_id = ?'
  ).all(operatorId, userId) as Array<{ portfolio_id: string }>;
  return rows.map((r) => r.portfolio_id);
}

/**
 * Configures the portfolio access whitelist for a subuser.
 */
export function setUserPortfolioAccess(
  userId: string,
  operatorId: string,
  portfolioIds: string[],
  dbInstance?: DatabaseSync
): void {
  const db = dbInstance || getDatabase();
  db.prepare('DELETE FROM user_portfolio_access WHERE operator_id = ? AND user_id = ?').run(operatorId, userId);
  const insert = db.prepare(
    'INSERT INTO user_portfolio_access (id, operator_id, user_id, portfolio_id, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const now = Date.now();
  for (const pid of portfolioIds) {
    insert.run(generateUUIDv7(), operatorId, userId, pid, now);
  }
}

/**
 * Retrieves the list of module IDs explicitly assigned to a subuser.
 */
export function getUserModuleAccess(
  userId: string,
  operatorId: string,
  dbInstance?: DatabaseSync
): string[] {
  const db = dbInstance || getDatabase();
  const rows = db.prepare(
    'SELECT module_id FROM user_module_access WHERE operator_id = ? AND user_id = ?'
  ).all(operatorId, userId) as Array<{ module_id: string }>;
  return rows.map((r) => r.module_id);
}

/**
 * Configures the module access whitelist for a subuser.
 */
export function setUserModuleAccess(
  userId: string,
  operatorId: string,
  moduleIds: string[],
  dbInstance?: DatabaseSync
): void {
  const db = dbInstance || getDatabase();
  db.prepare('DELETE FROM user_module_access WHERE operator_id = ? AND user_id = ?').run(operatorId, userId);
  const insert = db.prepare(
    'INSERT INTO user_module_access (id, operator_id, user_id, module_id, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const now = Date.now();
  for (const mid of moduleIds) {
    insert.run(generateUUIDv7(), operatorId, userId, mid, now);
  }
}
