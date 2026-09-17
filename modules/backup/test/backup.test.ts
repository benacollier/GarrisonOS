import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { BackupRepository } from '../backend/repository.js';
import { BackupService } from '../backend/service.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';
import { Router } from '../../../api/router.js';
import { registerRoutes } from '../backend/routes.js';

describe('Backup Module - Snapshots, Exports, and Integrity Verification', () => {
  const testTenant = 'tenant-backup-test';
  const otherTenant = 'tenant-other-test';
  const testStorageDir = path.resolve('./storage/test-backups');

  before(() => {
    process.env['STORAGE_PATH'] = testStorageDir;
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
    if (fs.existsSync(testStorageDir)) {
      try {
        fs.rmSync(testStorageDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('creates and lists backup records in the repository', () => {
    runInTenantContext(testTenant, () => {
      const created = BackupRepository.create({
        backup_type: 'tenant_data',
        filename: 'test-backup.json.gz',
        relative_path: 'test-backup.json.gz'
      });

      assert.ok(created.id);
      assert.equal(created.status, 'pending');
      assert.equal(created.backup_type, 'tenant_data');

      // Update status
      const updated = BackupRepository.updateStatus(created.id, {
        status: 'completed',
        file_size_bytes: 1024,
        checksum_sha256: 'abc123sha256hash'
      });

      assert.equal(updated?.status, 'completed');
      assert.equal(updated?.file_size_bytes, 1024);
      assert.equal(updated?.checksum_sha256, 'abc123sha256hash');

      // List backups
      const list = BackupRepository.list();
      assert.ok(list.items.some((b) => b.id === created.id));

      // Multi-tenancy isolation check
      runInTenantContext(otherTenant, () => {
        const otherList = BackupRepository.list();
        assert.equal(otherList.items.some((b) => b.id === created.id), false);
      });
    });
  });

  it('creates a tenant data export archive and verifies its content and checksum', async () => {
    await runInTenantContext(testTenant, async () => {
      // Seed a sample record in a tenant table
      const db = getDatabase();
      db.prepare(`
        INSERT INTO audit_logs (id, operator_id, user_id, entity_type, entity_id, action, changes_json, ip_address, created_at)
        VALUES ('log-1', ?, 'user-1', 'test', 'item-1', 'create', '{}', '127.0.0.1', ?)
      `).run(testTenant, Date.now());

      const backup = await BackupService.createTenantExport();
      assert.ok(backup.id);
      assert.equal(backup.status, 'completed');
      assert.ok(backup.file_size_bytes > 0);
      assert.ok(backup.checksum_sha256.length === 64);

      // Verify file exists on disk
      const filePath = BackupService.resolveSafeBackupPath(backup.relative_path);
      assert.ok(fs.existsSync(filePath));

      // Verify checksum
      const verification = await BackupService.verifyBackupIntegrity(backup.id);
      assert.equal(verification.valid, true);
      assert.equal(verification.calculatedSha256, backup.checksum_sha256);

      // Read and decompress export to verify tenant data isolation
      const compressedData = fs.readFileSync(filePath);
      const decompressed = zlib.gunzipSync(compressedData).toString('utf8');
      const parsed = JSON.parse(decompressed);

      assert.ok(parsed._export_metadata);
      assert.equal(parsed._export_metadata[0].operator_id || parsed._export_metadata[0].tenant_id, testTenant);
      assert.ok(Array.isArray(parsed.audit_logs));
      assert.ok(parsed.audit_logs.some((r: any) => r.id === 'log-1'));
    });
  });

  it('restores tenant data with clean_slate and merge options', async () => {
    await runInTenantContext(testTenant, async () => {
      const db = getDatabase();

      // 1. Establish initial state
      db.prepare(`
        INSERT INTO audit_logs (id, operator_id, user_id, entity_type, entity_id, action, changes_json, ip_address, created_at)
        VALUES ('log-snap-1', ?, 'user-1', 'test', 'item-snap', 'create', '{"version":1}', '127.0.0.1', ?)
      `).run(testTenant, Date.now());

      // Create backup
      const backup = await BackupService.createTenantExport();

      // 2. Mutate state: add new log and modify initial record
      db.prepare(`
        INSERT INTO audit_logs (id, operator_id, user_id, entity_type, entity_id, action, changes_json, ip_address, created_at)
        VALUES ('log-new-2', ?, 'user-1', 'test', 'item-new', 'create', '{"version":2}', '127.0.0.1', ?)
      `).run(testTenant, Date.now());

      // 3. Test MERGE mode: restores snapshot records but keeps new record
      const mergeResult = await BackupService.restoreTenantData(
        { backupId: backup.id },
        { mode: 'merge' }
      );
      assert.equal(mergeResult.success, true);
      assert.equal(mergeResult.mode, 'merge');

      const logsAfterMerge = db.prepare('SELECT id FROM audit_logs WHERE operator_id = ?').all(testTenant) as { id: string }[];
      const logIdsAfterMerge = logsAfterMerge.map((l) => l.id);
      assert.ok(logIdsAfterMerge.includes('log-snap-1'));
      assert.ok(logIdsAfterMerge.includes('log-new-2')); // preserved

      // 4. Test CLEAN_SLATE mode: replaces tenant records, clearing post-snapshot records
      const cleanResult = await BackupService.restoreTenantData(
        { backupId: backup.id },
        { mode: 'clean_slate' }
      );
      assert.equal(cleanResult.success, true);
      assert.equal(cleanResult.mode, 'clean_slate');

      const logsAfterClean = db.prepare('SELECT id FROM audit_logs WHERE operator_id = ?').all(testTenant) as { id: string }[];
      const logIdsAfterClean = logsAfterClean.map((l) => l.id);
      assert.ok(logIdsAfterClean.includes('log-snap-1'));
      assert.equal(logIdsAfterClean.includes('log-new-2'), false); // wiped clean
    });
  });

  it('handles compound unique constraint conflicts during merge restore', async () => {
    await runInTenantContext(testTenant, async () => {
      const db = getDatabase();
      const now = Date.now();

      // Seed property, unit, contact, and lease for foreign keys
      db.prepare(`
        INSERT INTO properties (id, operator_id, name, property_type, address_line1, city, state, postal_code, created_at, updated_at)
        VALUES ('prop-u1', ?, 'Prop', 'single_family', '123 St', 'City', 'ST', '12345', ?, ?)
      `).run(testTenant, now, now);

      db.prepare(`
        INSERT INTO units (id, operator_id, property_id, unit_number, status, market_rent_cents, created_at, updated_at)
        VALUES ('unit-u1', ?, 'prop-u1', '101', 'occupied', 100000, ?, ?)
      `).run(testTenant, now, now);

      db.prepare(`
        INSERT INTO contacts (id, operator_id, contact_type, first_name, last_name, created_at, updated_at)
        VALUES ('cont-u1', ?, 'tenant', 'Alice', 'Smith', ?, ?)
      `).run(testTenant, now, now);

      db.prepare(`
        INSERT INTO leases (id, operator_id, unit_id, status, start_date, end_date, rent_amount_cents, created_at, updated_at)
        VALUES ('lease-u1', ?, 'unit-u1', 'active', ?, ?, 100000, ?, ?)
      `).run(testTenant, now, now + 86400000, now, now);

      // Add a lease contact row in the snapshot
      db.prepare(`
        INSERT INTO lease_contacts (id, operator_id, lease_id, contact_id, role, created_at)
        VALUES ('lc-orig-id', ?, 'lease-u1', 'cont-u1', 'primary_tenant', ?)
      `).run(testTenant, now);

      // Create backup archive
      const backup = await BackupService.createTenantExport();

      // Re-create the same association under a DIFFERENT row ID
      db.prepare('DELETE FROM lease_contacts WHERE id = ?').run('lc-orig-id');
      db.prepare(`
        INSERT INTO lease_contacts (id, operator_id, lease_id, contact_id, role, created_at)
        VALUES ('lc-different-id', ?, 'lease-u1', 'cont-u1', 'primary_tenant', ?)
      `).run(testTenant, now);

      // Restoring in merge mode must replace conflicting natural key row without UNIQUE constraint failure
      const mergeRes = await BackupService.restoreTenantData(
        { backupId: backup.id },
        { mode: 'merge' }
      );
      assert.equal(mergeRes.success, true);

      const rows = db.prepare('SELECT id, role FROM lease_contacts WHERE operator_id = ? AND lease_id = ? AND contact_id = ?')
        .all(testTenant, 'lease-u1', 'cont-u1') as { id: string; role: string }[];
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.id, 'lc-orig-id');
    });
  });

  it('rejects cross-tenant data restoration attempts', async () => {
    let backupId = '';
    await runInTenantContext(testTenant, async () => {
      const backup = await BackupService.createTenantExport();
      backupId = backup.id;
    });

    // Attempt to restore testTenant's archive while operating under otherTenant context
    await runInTenantContext(otherTenant, async () => {
      await assert.rejects(async () => {
        await BackupService.restoreTenantData({ backupId });
      }, /not found|prohibited/);
    });
  });

  it('prevents path traversal during file resolution', () => {
    assert.throws(() => {
      BackupService.resolveSafeBackupPath('../../../etc/passwd');
    }, /traversal/);
  });

  it('deletes backup record and removes physical archive from disk', async () => {
    await runInTenantContext(testTenant, async () => {
      const backup = await BackupService.createTenantExport();
      const filePath = BackupService.resolveSafeBackupPath(backup.relative_path);
      assert.ok(fs.existsSync(filePath));

      const deleted = BackupService.deleteBackup(backup.id);
      assert.equal(deleted, true);

      // Soft deleted from DB
      assert.equal(BackupRepository.getById(backup.id), null);

      // Physically removed from disk
      assert.equal(fs.existsSync(filePath), false);
    });
  });

  it('validates query parameters defensively on backup listing route', async () => {
    const router = new Router();
    registerRoutes(router);

    const dispatch = async (query: string): Promise<{ status: number; body: any }> => {
      return runInTenantContext(testTenant, async () => {
        let statusCode = 200;
        let responseBody = '';

        const req: any = {
          method: 'GET',
          url: `/api/v1/backups${query}`,
          headers: { host: '127.0.0.1:3000' },
          socket: { remoteAddress: '127.0.0.1' },
          on: () => {},
          once: () => {},
          emit: () => false
        };

        const res: any = {
          statusCode: 200,
          setHeader: () => {},
          writeHead: (code: number) => {
            statusCode = code;
          },
          end: (chunk?: string) => {
            if (chunk) responseBody += chunk;
          }
        };

        await router.handle(req, res);
        return {
          status: statusCode,
          body: responseBody ? JSON.parse(responseBody) : null
        };
      });
    };

    // Valid requests
    const validDefault = await dispatch('');
    assert.equal(validDefault.status, 200);
    assert.equal(validDefault.body.success, true);

    const validParams = await dispatch('?limit=10&offset=0');
    assert.equal(validParams.status, 200);
    assert.equal(validParams.body.success, true);

    // Negative limit
    const negLimit = await dispatch('?limit=-5');
    assert.equal(negLimit.status, 400);
    assert.equal(negLimit.body.error.code, 'VALIDATION_ERROR');

    // Limit out of bounds (> 100)
    const bigLimit = await dispatch('?limit=250');
    assert.equal(bigLimit.status, 400);
    assert.equal(bigLimit.body.error.code, 'VALIDATION_ERROR');

    // Non-integer limit
    const floatLimit = await dispatch('?limit=10.5');
    assert.equal(floatLimit.status, 400);
    assert.equal(floatLimit.body.error.code, 'VALIDATION_ERROR');

    // Non-numeric limit (NaN)
    const nanLimit = await dispatch('?limit=invalid');
    assert.equal(nanLimit.status, 400);
    assert.equal(nanLimit.body.error.code, 'VALIDATION_ERROR');

    // Negative offset
    const negOffset = await dispatch('?offset=-1');
    assert.equal(negOffset.status, 400);
    assert.equal(negOffset.body.error.code, 'VALIDATION_ERROR');

    // Non-integer offset
    const nanOffset = await dispatch('?offset=foo');
    assert.equal(nanOffset.status, 400);
    assert.equal(nanOffset.body.error.code, 'VALIDATION_ERROR');
  });
});
