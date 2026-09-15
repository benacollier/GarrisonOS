import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Router } from '../api/router.js';
import { eventBus } from '../core/events.js';
import { loadModules, getLoadedModules } from '../core/module-loader.js';
import { findMigrations, runMigrations } from '../database/migrator.js';
import { getDatabase, closeDatabase } from '../database/client.js';

describe('Dynamic Module Loader & Migration Discovery Subsystem', () => {
  before(() => {
    getDatabase({ inMemory: true });
  });

  after(() => {
    closeDatabase();
  });

  it('discovers core and all 5 module SQL migration files', () => {
    const migrations = findMigrations();
    assert.ok(migrations.length >= 6);

    const modules = new Set(migrations.map((m) => m.module));
    assert.ok(modules.has('core'));
    assert.ok(modules.has('properties'));
    assert.ok(modules.has('contacts'));
    assert.ok(modules.has('leases'));
    assert.ok(modules.has('accounting'));
    assert.ok(modules.has('maintenance'));
  });

  it('dynamically loads and registers all modules into runtime', async () => {
    const router = new Router();
    const loaded = await loadModules(router, eventBus);

    assert.ok(loaded.length >= 5);
    const moduleIds = loaded.map((m) => m.manifest.id);
    assert.ok(moduleIds.includes('properties'));
    assert.ok(moduleIds.includes('contacts'));
    assert.ok(moduleIds.includes('leases'));
    assert.ok(moduleIds.includes('accounting'));
    assert.ok(moduleIds.includes('maintenance'));

    // Introspection registry matches
    const registered = getLoadedModules();
    assert.equal(registered.length, loaded.length);
  });

  it('ensures all registered modules package their own test suites', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const loaded = getLoadedModules();

    for (const mod of loaded) {
      const testDir = path.join(mod.moduleDir, 'test');
      assert.ok(
        fs.existsSync(testDir) && fs.statSync(testDir).isDirectory(),
        `Module ${mod.manifest.id} must include a test/ directory`
      );

      const testFiles = fs.readdirSync(testDir).filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.js'));
      assert.ok(
        testFiles.length > 0,
        `Module ${mod.manifest.id} must contain at least one packaged test file (*.test.ts) in ${testDir}`
      );
    }
  });
});

