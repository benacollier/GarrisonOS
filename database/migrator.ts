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
  dependencies: string[];
}

export function buildDependencyGraph(migrations: MigrationFile[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const mig of migrations) {
    const node = mig.module;
    if (!graph.has(node)) {
      graph.set(node, new Set());
    }

    for (const dep of mig.dependencies) {
      if (!graph.has(dep)) {
        graph.set(dep, new Set());
      }
      graph.get(dep)!.add(node);
    }
  }

  return graph;
}

export function topologicalSort(migrations: MigrationFile[]): MigrationFile[] {
  if (migrations.length === 0) {
    return [];
  }

  const graph = buildDependencyGraph(migrations);
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  const result: MigrationFile[] = [];
  const sortedModules = new Set<string>();

  for (const node of graph.keys()) {
    inDegree.set(node, 0);
  }

  for (const [node, deps] of graph) {
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
    }
  }

  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  while (queue.length > 0) {
    const module = queue.shift()!;
    sortedModules.add(module);

    const moduleMigrations = migrations.filter((m) => m.module === module);
    result.push(...moduleMigrations);

    const dependents = graph.get(module) || new Set();
    for (const dep of dependents) {
      const degree = inDegree.get(dep) || 0;
      inDegree.set(dep, degree - 1);
      if (degree - 1 === 0) {
        queue.push(dep);
      }
    }
  }

  if (sortedModules.size < graph.size) {
    const unprocessed = [...graph.keys()].filter((m) => !sortedModules.has(m));
    throw new Error(`Circular dependency detected involving modules: ${unprocessed.join(', ')}`);
  }

  return result;
}

export function findMigrations(baseDir: string = process.cwd()): MigrationFile[] {
  const migrations: MigrationFile[] = [];

  // 1. Load module manifests to get dependencies
  const modulesManifests = new Map<string, { dependencies: string[] }>();
  const modulesDir = path.resolve(baseDir, 'modules');
  if (fs.existsSync(modulesDir)) {
    const moduleNames = fs.readdirSync(modulesDir).sort();
    for (const mod of moduleNames) {
      const manifestPath = path.join(modulesDir, mod, 'module.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestRaw) as { dependencies?: string[] };
          modulesManifests.set(mod, { dependencies: manifest.dependencies || [] });
        } catch {
          modulesManifests.set(mod, { dependencies: [] });
        }
      }
    }
  }

  // 2. Core migrations (no dependencies)
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
        sql,
        dependencies: []
      });
    }
  }

  // 3. Module migrations
  if (fs.existsSync(modulesDir)) {
    const moduleNames = fs.readdirSync(modulesDir).sort();
    for (const mod of moduleNames) {
      const modMigrationsDir = path.join(modulesDir, mod, 'backend/migrations');
      if (fs.existsSync(modMigrationsDir) && fs.statSync(modMigrationsDir).isDirectory()) {
        const files = fs.readdirSync(modMigrationsDir).filter((f) => f.endsWith('.sql')).sort();
        const deps = modulesManifests.get(mod)?.dependencies || [];
        for (const file of files) {
          const fullPath = path.join(modMigrationsDir, file);
          const sql = fs.readFileSync(fullPath, 'utf8');
          migrations.push({
            id: `${mod}_${file}`,
            name: file,
            module: mod,
            fullPath,
            sql,
            dependencies: deps
          });
        }
      }
    }
  }

  // Apply topological sort based on module dependencies
  return topologicalSort(migrations);
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

