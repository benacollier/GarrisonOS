import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { BackupRepository } from '../backend/repository.js';
import { BackupService } from '../backend/service.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

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
      // Seed a sample record in a tenant table (e.g. audit_logs or contacts)
      const db = getDatabase();
      db.prepare(`
        INSERT INTO audit_logs (id, tenant_id, user_id, entity_type, entity_id, action, changes_json, ip_address, created_at)
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
      assert.equal(parsed._export_metadata[0].tenant_id, testTenant);
      assert.ok(Array.isArray(parsed.audit_logs));
      assert.ok(parsed.audit_logs.some((r: any) => r.id === 'log-1'));
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
});

