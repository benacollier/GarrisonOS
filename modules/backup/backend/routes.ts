import * as fs from 'node:fs';
import { Router } from '../../../api/router.js';
import { successResponse, errorResponse } from '../../../api/response.js';
import { BackupRepository } from './repository.js';
import { BackupService, RestoreTenantOptions } from './service.js';
import { BackupScheduler } from './scheduler.js';
import { eventBus } from '../../../core/events.js';

export function registerRoutes(router: Router): void {
  // Scheduler status
  router.getBatchSafe('/api/v1/backups/scheduler/status', (_req, res) => {
    try {
      const scheduler = BackupScheduler.getInstance();
      const status = scheduler.getStatus();
      successResponse(res, { scheduler: status });
    } catch (err: any) {
      errorResponse(res, 'SYSTEM_ERROR', err.message, 500);
    }
  });

  // Trigger manual scheduler job (backup or vacuum)
  router.post('/api/v1/backups/scheduler/trigger', async (req, res) => {
    try {
      const { action } = (req as any).body || {};
      const scheduler = BackupScheduler.getInstance();

      if (action === 'vacuum') {
        const result = await scheduler.executeScheduledVacuum();
        return successResponse(res, { message: 'Database maintenance routine executed successfully', result });
      }

      const record = await scheduler.executeScheduledBackup();
      successResponse(res, { message: 'Scheduled backup executed successfully', backup: record }, 201);
    } catch (err: any) {
      errorResponse(res, 'SCHEDULER_ERROR', err.message, 500);
    }
  });

  // List backups
  router.getBatchSafe('/api/v1/backups', (req, res) => {
    try {
      const rawLimit = (req as any).query?.['limit'];
      const rawOffset = (req as any).query?.['offset'];

      let limit = 50;
      let offset = 0;

      if (rawLimit !== undefined && rawLimit !== '') {
        const parsed = Number(rawLimit);
        if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) {
          return errorResponse(res, 'VALIDATION_ERROR', 'Query parameter "limit" must be a positive integer between 1 and 100', 400);
        }
        limit = parsed;
      }

      if (rawOffset !== undefined && rawOffset !== '') {
        const parsed = Number(rawOffset);
        if (!Number.isInteger(parsed) || parsed < 0) {
          return errorResponse(res, 'VALIDATION_ERROR', 'Query parameter "offset" must be a non-negative integer', 400);
        }
        offset = parsed;
      }

      const result = BackupRepository.list(limit, offset);
      successResponse(res, result);
    } catch (err: any) {
      errorResponse(res, 'SYSTEM_ERROR', err.message, 500);
    }
  });

  // Create backup (full_system or operator_data)
  router.post('/api/v1/backups', async (req, res) => {
    try {
      const { type } = (req as any).body || {};
      const backupType = type === 'full_system' ? 'full_system' : 'operator_data';

      let record;
      if (backupType === 'full_system') {
        record = await BackupService.createFullDatabaseBackup();
      } else {
        record = await BackupService.createOperatorExport();
      }

      eventBus.publish('backup.created', {
        backupId: record.id,
        operatorId: record.operator_id,
        tenantId: record.operator_id,
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

  // Restore operator data from an existing backup ID
  router.post('/api/v1/backups/:id/restore', async (req, res) => {
    try {
      const { id } = (req as any).params;
      const body = (req as any).body || {};
      const mode = body.mode === 'merge' ? 'merge' : 'clean_slate';

      const result = await BackupService.restoreOperatorData(
        { backupId: id },
        { mode }
      );

      eventBus.publish('backup.restored', {
        backupId: id,
        mode,
        restoredTables: result.restoredTables
      });

      successResponse(res, {
        message: `Operator data restored successfully in ${mode} mode`,
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
