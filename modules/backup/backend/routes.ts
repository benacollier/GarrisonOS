import * as fs from 'node:fs';
import { Router } from '../../../api/router.js';
import { successResponse, errorResponse } from '../../../api/response.js';
import { BackupRepository } from './repository.js';
import { BackupService, RestoreTenantOptions } from './service.js';
import { eventBus } from '../../../core/events.js';

export function registerRoutes(router: Router): void {
  // List backups
  router.getBatchSafe('/api/v1/backups', (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const result = BackupRepository.list(limit, offset);
      successResponse(res, result);
    } catch (err: any) {
      errorResponse(res, 'SYSTEM_ERROR', err.message, 500);
    }
  });

  // Create backup (full_system or tenant_data)
  router.post('/api/v1/backups', async (req, res) => {
    try {
      const { type } = (req as any).body || {};
      const backupType = type === 'full_system' ? 'full_system' : 'tenant_data';

      let record;
      if (backupType === 'full_system') {
        record = await BackupService.createFullDatabaseBackup();
      } else {
        record = await BackupService.createTenantExport();
      }

      eventBus.publish('backup.created', {
        backupId: record.id,
        tenantId: record.tenant_id,
        backupType: record.backup_type
      });

      successResponse(res, { backup: record }, 201);
    } catch (err: any) {
      eventBus.publish('backup.failed', {
        error: err.message
      });
      errorResponse(res, 'BACKUP_FAILED', err.message, 500);
    }
  });

  // Get backup by id
  router.get('/api/v1/backups/:id', (req, res) => {
    try {
      const { id } = (req as any).params;
      const backup = BackupRepository.getById(id);
      if (!backup) {
        return errorResponse(res, 'NOT_FOUND', 'Backup record not found', 404);
      }
      successResponse(res, { backup });
    } catch (err: any) {
      errorResponse(res, 'SYSTEM_ERROR', err.message, 500);
    }
  });

  // Download backup archive
  router.get('/api/v1/backups/:id/download', (req, res) => {
    try {
      const { id } = (req as any).params;
      const backup = BackupRepository.getById(id);
      if (!backup) {
        return errorResponse(res, 'NOT_FOUND', 'Backup record not found', 404);
      }

      if (backup.status !== 'completed') {
        return errorResponse(res, 'INVALID_STATE', 'Backup is not completed', 400);
      }

      const filePath = BackupService.resolveSafeBackupPath(backup.relative_path);
      if (!fs.existsSync(filePath)) {
        return errorResponse(res, 'NOT_FOUND', 'Backup file missing from storage', 404);
      }

      const stat = fs.statSync(filePath);
      const isGzip = backup.filename.endsWith('.gz');

      res.writeHead(200, {
        'Content-Type': isGzip ? 'application/gzip' : 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${backup.filename}"`
      });

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
    } catch (err: any) {
      errorResponse(res, 'SYSTEM_ERROR', err.message, 500);
    }
  });

  // Verify backup integrity
  router.post('/api/v1/backups/:id/verify', async (req, res) => {
    try {
      const { id } = (req as any).params;
      const result = await BackupService.verifyBackupIntegrity(id);
      successResponse(res, {
        valid: result.valid,
        expectedSha256: result.record.checksum_sha256,
        calculatedSha256: result.calculatedSha256
      });
    } catch (err: any) {
      errorResponse(res, 'VERIFICATION_FAILED', err.message, 500);
    }
  });

  // Restore tenant data from an existing backup ID
  router.post('/api/v1/backups/:id/restore', async (req, res) => {
    try {
      const { id } = (req as any).params;
      const body = (req as any).body || {};
      const mode = body.mode === 'merge' ? 'merge' : 'clean_slate';

      const result = await BackupService.restoreTenantData(
        { backupId: id },
        { mode }
      );

      eventBus.publish('backup.restored', {
        backupId: id,
        mode,
        restoredTables: result.restoredTables
      });

      successResponse(res, {
        message: `Tenant data restored successfully in ${mode} mode`,
        ...result
      });
    } catch (err: any) {
      errorResponse(res, 'RESTORE_FAILED', err.message, 400);
    }
  });

  // Delete backup
  router.delete('/api/v1/backups/:id', (req, res) => {
    try {
      const { id } = (req as any).params;
      const deleted = BackupService.deleteBackup(id);
      if (!deleted) {
        return errorResponse(res, 'NOT_FOUND', 'Backup not found or already deleted', 404);
      }

      eventBus.publish('backup.deleted', { backupId: id });
      successResponse(res, { success: true });
    } catch (err: any) {
      errorResponse(res, 'SYSTEM_ERROR', err.message, 500);
    }
  });
}
