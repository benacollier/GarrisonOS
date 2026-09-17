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

export function ensureOperator(operatorId: string, dbInstance?: DatabaseSync): void {
  try {
    const db = dbInstance || getDatabase();
    const now = Date.now();
    db.prepare(`
      INSERT INTO operators (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `).run(operatorId, `Operator ${operatorId}`, now, now);
  } catch {
    // Ignore if table not yet initialized in isolated test
  }
}

export const ensureTenant = ensureOperator;

export function runInOperatorContext<T>(operatorId: string, fn: () => T, userId?: string): T {
  ensureOperator(operatorId);
  return RequestContext.run(
    {
      operatorId,
      tenantId: operatorId,
      userId: userId || generateUUIDv7(),
      correlationId: generateUUIDv7()
    },
    fn
  );
}

export const runInTenantContext = runInOperatorContext;

