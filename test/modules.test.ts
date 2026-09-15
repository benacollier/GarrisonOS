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

    assert.equal(loaded.length, 5);
    const moduleIds = loaded.map((m) => m.manifest.id).sort();
    assert.deepEqual(moduleIds, ['accounting', 'contacts', 'leases', 'maintenance', 'properties']);

    // Introspection registry matches
    const registered = getLoadedModules();
    assert.equal(registered.length, 5);
  });
});

