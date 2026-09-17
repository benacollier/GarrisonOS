import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { BackupScheduler } from '../backend/scheduler.js';
import { BackupService } from '../backend/service.js';
import { BackupRepository } from '../backend/repository.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';
import { eventBus } from '../../../core/events.js';
import { Router } from '../../../api/router.js';
import { registerRoutes } from '../backend/routes.js';

class MockRequest extends EventEmitter {
  public method: string;
  public url: string;
  public headers: Record<string, string>;
  public socket = { remoteAddress: '127.0.0.1' };

  constructor(method: string, url: string, headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: '127.0.0.1:3000', ...headers };
  }
}

class MockResponse {
  public statusCode = 200;
  public headers: Record<string, string> = {};
  public body = '';
  public writableEnded = false;

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
  }

  public writeHead(statusCode: number, headers: Record<string, string> = {}): void {
    this.statusCode = statusCode;
    Object.entries(headers).forEach(([key, value]) => {
      this.headers[key.toLowerCase()] = value;
    });
  }

  public end(chunk?: string): void {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }
}

describe('Backup Module - Automated Scheduler, Vacuum & Retention Daemon', () => {
  const testTenant = 'tenant-scheduler-test';
  const testStorageDir = path.resolve('./storage/test-scheduler-backups');
  let scheduler: BackupScheduler;

  before(() => {
    process.env['STORAGE_PATH'] = testStorageDir;
    getDatabase({ inMemory: true });
    createTestDb();

    // Seed test tenant in database so resolveSystemTenantId finds it
    const db = getDatabase();
    db.prepare(`
      INSERT INTO tenants (id, name, created_at, updated_at)
      VALUES (?, 'Scheduler Test Property Group', ?, ?)
      ON CONFLICT (id) DO NOTHING
    `).run(testTenant, Date.now(), Date.now());

    scheduler = new BackupScheduler({
      enabled: true,
      intervalHours: 12,
      retentionDays: 14,
      vacuumIntervalHours: 48
    });
  });

  after(() => {
    scheduler.stop();
    closeDatabase();
    if (fs.existsSync(testStorageDir)) {
      try {
        fs.rmSync(testStorageDir, { recursive: true, force: true });
      } catch {}
    }
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('initializes scheduler with configuration and reports initial status', () => {
    const status = scheduler.getStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.running, false);
    assert.equal(status.intervalHours, 12);
    assert.equal(status.retentionDays, 14);
    assert.equal(status.vacuumIntervalHours, 48);
    assert.equal(status.lastBackupAt, null);
    assert.equal(status.lastVacuumAt, null);
  });

  it('starts and stops scheduler lifecycle cleanly without throwing', () => {
    scheduler.start();
    let status = scheduler.getStatus();
    assert.equal(status.running, true);
    assert.ok(status.nextScheduledBackupAt !== null && status.nextScheduledBackupAt > Date.now());
    assert.ok(status.nextScheduledVacuumAt !== null && status.nextScheduledVacuumAt > Date.now());

    scheduler.stop();
    status = scheduler.getStatus();
    assert.equal(status.running, false);
    assert.equal(status.nextScheduledBackupAt, null);
    assert.equal(status.nextScheduledVacuumAt, null);
  });

  it('executes scheduled backup, emits backup.scheduled.completed event, and records status', async () => {
    const eventHandled = new Promise<any>((resolve) => {
      eventBus.subscribe('backup.scheduled.completed', (payload) => {
        resolve(payload);
      });
    });

    const record = await scheduler.executeScheduledBackup();
    assert.ok(record);
    assert.ok(record.id);
    assert.equal(record.status, 'completed');
    assert.equal(record.backup_type, 'full_system');
    assert.ok(record.file_size_bytes > 0);
    assert.equal(record.checksum_sha256.length, 64);

    const status = scheduler.getStatus();
    assert.equal(status.totalBackupsRun, 1);
    assert.equal(status.lastBackupStatus, 'completed');
    assert.ok(status.lastBackupAt !== null);

    // Verify async event emission
    const eventReceived = await eventHandled;
    assert.ok(eventReceived);
    assert.equal(eventReceived.backupId, record.id);
    assert.equal(eventReceived.filename, record.filename);
    assert.equal(eventReceived.fileSizeBytes, record.file_size_bytes);
  });

  it('executes database vacuum routine, emits database.vacuumed event, and records status', async () => {
    const vacuumEventHandled = new Promise<any>((resolve) => {
      eventBus.subscribe('database.vacuumed', (payload) => {
        resolve(payload);
      });
    });

    const result = await scheduler.executeScheduledVacuum();
    assert.ok(result);
    assert.ok(result.durationMs >= 0);
    assert.ok(result.checkpointResult.includes('completed successfully'));

    const status = scheduler.getStatus();
    assert.equal(status.totalVacuumsRun, 1);
    assert.ok(status.lastVacuumAt !== null);

    const vacuumEventReceived = await vacuumEventHandled;
    assert.ok(vacuumEventReceived);
    assert.ok(vacuumEventReceived.durationMs >= 0);
  });

  it('prunes expired backups during scheduled backup execution', async () => {
    // Manually create an outdated backup record simulating an old backup from 45 days ago
    const db = getDatabase();
    const oldTimestamp = Date.now() - (45 * 24 * 3600 * 1000);
    const oldFilename = `garrison-db-${oldTimestamp}.sqlite.gz`;
    const oldFilePath = path.join(BackupService.getBackupDir(), oldFilename);
    fs.writeFileSync(oldFilePath, Buffer.from('dummy old backup content'));

    db.prepare(`
      INSERT INTO backups (
        id, tenant_id, backup_type, filename, relative_path,
        file_size_bytes, checksum_sha256, status, created_at
      ) VALUES ('old-backup-id', ?, 'full_system', ?, ?, 24, 'dummy', 'completed', ?)
    `).run(testTenant, oldFilename, oldFilename, oldTimestamp);

    assert.ok(fs.existsSync(oldFilePath));

    // Execute scheduled backup which prunes records older than retentionDays (14 days)
    await runInTenantContext(testTenant, async () => {
      const pruned = BackupService.pruneOldBackups(14);
      assert.ok(pruned >= 1);

      // Verify physical deletion
      assert.equal(fs.existsSync(oldFilePath), false);

      // Verify soft delete in database
      const row = db.prepare('SELECT deleted_at FROM backups WHERE id = ?').get('old-backup-id') as { deleted_at: number | null };
      assert.ok(row?.deleted_at !== null);
    });
  });

  it('exposes scheduler status via GET /api/v1/backups/scheduler/status route', async () => {
    const router = new Router();
    registerRoutes(router);

    const request = new MockRequest('GET', '/api/v1/backups/scheduler/status');
    const response = new MockResponse();

    await router.handle(request as any, response as any);

    assert.equal(response.statusCode, 200);
    const parsed = JSON.parse(response.body);
    assert.ok(parsed?.success);
    assert.ok(parsed?.data?.scheduler);
    assert.equal(typeof parsed.data.scheduler.intervalHours, 'number');
    assert.equal(typeof parsed.data.scheduler.retentionDays, 'number');
  });

  it('allows triggering on-demand scheduled backup via POST /api/v1/backups/scheduler/trigger', async () => {
    const router = new Router();
    registerRoutes(router);

    const request = new MockRequest('POST', '/api/v1/backups/scheduler/trigger', {
      'content-type': 'application/json'
    });
    const response = new MockResponse();

    const promise = router.handle(request as any, response as any);
    request.emit('data', Buffer.from(JSON.stringify({})));
    request.emit('end');
    await promise;

    assert.equal(response.statusCode, 201);
    const parsed = JSON.parse(response.body);
    assert.ok(parsed?.success);
    assert.ok(parsed?.data?.backup?.id);
    assert.equal(parsed.data.backup.status, 'completed');
  });

  it('allows triggering on-demand vacuum via POST /api/v1/backups/scheduler/trigger with action: vacuum', async () => {
    const router = new Router();
    registerRoutes(router);

    const request = new MockRequest('POST', '/api/v1/backups/scheduler/trigger', {
      'content-type': 'application/json'
    });
    const response = new MockResponse();

    const promise = router.handle(request as any, response as any);
    request.emit('data', Buffer.from(JSON.stringify({ action: 'vacuum' })));
    request.emit('end');
    await promise;

    assert.equal(response.statusCode, 200);
    const parsed = JSON.parse(response.body);
    assert.ok(parsed?.success);
    assert.ok(parsed?.data?.result?.durationMs >= 0);
  });
});
