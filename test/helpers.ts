import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../database/migrator.js';
import { RequestContext } from '../core/context.js';
import { generateUUIDv7 } from '../core/crypto.js';
import { getDatabase, closeDatabase } from '../database/client.js';

export function createTestDb(): DatabaseSync {
  closeDatabase();
  const db = getDatabase({ inMemory: true });
  runMigrations(db);
  return db;
}

export function ensureTenant(tenantId: string, dbInstance?: DatabaseSync): void {
  try {
    const db = dbInstance || getDatabase();
    const now = Date.now();
    db.prepare(`
      INSERT INTO tenants (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `).run(tenantId, `Tenant ${tenantId}`, now, now);
  } catch {
    // Ignore if table not yet initialized in isolated test
  }
}

export function runInTenantContext<T>(tenantId: string, fn: () => T, userId?: string): T {
  ensureTenant(tenantId);
  return RequestContext.run(
    {
      tenantId,
      userId: userId || generateUUIDv7(),
      correlationId: generateUUIDv7()
    },
    fn
  );
}
