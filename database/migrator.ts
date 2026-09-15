import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, withTransaction } from './client.js';
import { generateUUIDv7 } from '../core/crypto.js';

export interface MigrationFile {
  id: string;
  name: string;
  module: string;
  fullPath: string;
  sql: string;
}

export function findMigrations(baseDir: string = process.cwd()): MigrationFile[] {
  const migrations: MigrationFile[] = [];

  // 1. Core migrations
  const coreMigrationsDir = path.resolve(baseDir, 'database/migrations');
  if (fs.existsSync(coreMigrationsDir)) {
    const files = fs.readdirSync(coreMigrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const fullPath = path.join(coreMigrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      migrations.push({
        id: `core_${file}`,
        name: file,
        module: 'core',
        fullPath,
        sql
      });
    }
  }

  // 2. Module migrations
  const modulesDir = path.resolve(baseDir, 'modules');
  if (fs.existsSync(modulesDir)) {
    const moduleNames = fs.readdirSync(modulesDir).sort();
    for (const mod of moduleNames) {
      const modMigrationsDir = path.join(modulesDir, mod, 'backend/migrations');
      if (fs.existsSync(modMigrationsDir) && fs.statSync(modMigrationsDir).isDirectory()) {
        const files = fs.readdirSync(modMigrationsDir).filter((f) => f.endsWith('.sql')).sort();
        for (const file of files) {
          const fullPath = path.join(modMigrationsDir, file);
          const sql = fs.readFileSync(fullPath, 'utf8');
          migrations.push({
            id: `${mod}_${file}`,
            name: file,
            module: mod,
            fullPath,
            sql
          });
        }
      }
    }
  }

  return migrations;
}

export function runMigrations(dbInstance?: DatabaseSync, baseDir: string = process.cwd()): string[] {
  const db = dbInstance || getDatabase();

  // Ensure migration tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      module TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name, module FROM _migrations').all() as Array<{ name: string; module: string }>;
  const appliedSet = new Set(appliedRows.map((r) => `${r.module}:${r.name}`));

  const allMigrations = findMigrations(baseDir);
  const appliedList: string[] = [];

  for (const mig of allMigrations) {
    const key = `${mig.module}:${mig.name}`;
    if (!appliedSet.has(key)) {
      withTransaction((tx) => {
        tx.exec(mig.sql);
        const insertStmt = tx.prepare(`
          INSERT INTO _migrations (id, name, module, applied_at)
          VALUES (?, ?, ?, ?)
        `);
        insertStmt.run(generateUUIDv7(), mig.name, mig.module, Date.now());
      }, db);
      appliedList.push(key);
    }
  }

  return appliedList;
}

// CLI Execution Entrypoint
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('migrator.ts') ||
  process.argv[1].endsWith('migrator.js') ||
  (import.meta.url && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
);

if (isDirectExecution) {
  try {
    const applied = runMigrations();
    if (applied.length === 0) {
      process.stdout.write('Database is already up to date. No new migrations applied.\n');
    } else {
      process.stdout.write(`Successfully applied ${applied.length} migration(s):\n`);
      for (const item of applied) {
        process.stdout.write(`  + ${item}\n`);
      }
    }
    process.exit(0);
  } catch (error) {
    process.stderr.write(`Migration failed: ${String(error)}\n`);
    process.exit(1);
  }
}
