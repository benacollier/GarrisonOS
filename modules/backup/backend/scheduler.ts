import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';
import { eventBus } from '../../../core/events.js';
import { getDatabase } from '../../../database/client.js';
import { BackupRecord } from './repository.js';
import { BackupService } from './service.js';

export interface SchedulerConfig {
  enabled: boolean;
  intervalHours: number;
  retentionDays: number;
  vacuumIntervalHours: number;
}

export interface SchedulerStatus {
  enabled: boolean;
  running: boolean;
  intervalHours: number;
  retentionDays: number;
  vacuumIntervalHours: number;
  lastBackupAt: number | null;
  lastBackupStatus: 'completed' | 'failed' | null;
  lastVacuumAt: number | null;
  nextScheduledBackupAt: number | null;
  nextScheduledVacuumAt: number | null;
  totalBackupsRun: number;
  totalVacuumsRun: number;
}

/**
 * In-process background scheduler for automated database snapshots, maintenance,
 * and retention pruning without external cron or runtime dependencies.
 */
export class BackupScheduler {
  private static instance: BackupScheduler | null = null;

  private backupTimer: NodeJS.Timeout | null = null;
  private vacuumTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  private config: SchedulerConfig;
  private lastBackupAt: number | null = null;
  private lastBackupStatus: 'completed' | 'failed' | null = null;
  private lastVacuumAt: number | null = null;
  private nextScheduledBackupAt: number | null = null;
  private nextScheduledVacuumAt: number | null = null;
  private totalBackupsRun: number = 0;
  private totalVacuumsRun: number = 0;

  constructor(customConfig: Partial<SchedulerConfig> = {}) {
    const envEnabled = process.env['BACKUP_SCHEDULE_ENABLED'];
    const isEnabled = envEnabled !== undefined
      ? envEnabled !== 'false' && envEnabled !== '0'
      : true;

    const envInterval = process.env['BACKUP_INTERVAL_HOURS'];
    const parsedInterval = envInterval ? Number(envInterval) : 24;
    const intervalHours = Number.isInteger(parsedInterval) && parsedInterval > 0
      ? parsedInterval
      : 24;

    const envRetention = process.env['BACKUP_RETENTION_DAYS'];
    const parsedRetention = envRetention ? Number(envRetention) : 30;
    const retentionDays = Number.isInteger(parsedRetention) && parsedRetention > 0
      ? parsedRetention
      : 30;

    const envVacuumInterval = process.env['BACKUP_VACUUM_INTERVAL_HOURS'];
    const parsedVacuumInterval = envVacuumInterval ? Number(envVacuumInterval) : 168; // Default weekly (7 days)
    const vacuumIntervalHours = Number.isInteger(parsedVacuumInterval) && parsedVacuumInterval > 0
      ? parsedVacuumInterval
      : 168;

    this.config = {
      enabled: customConfig.enabled !== undefined ? customConfig.enabled : isEnabled,
      intervalHours: customConfig.intervalHours ?? intervalHours,
      retentionDays: customConfig.retentionDays ?? retentionDays,
      vacuumIntervalHours: customConfig.vacuumIntervalHours ?? vacuumIntervalHours
    };
  }

  public static getInstance(config?: Partial<SchedulerConfig>): BackupScheduler {
    if (!BackupScheduler.instance) {
      BackupScheduler.instance = new BackupScheduler(config);
    }
    return BackupScheduler.instance;
  }

  /**
   * Resolve an existing tenant ID for system background jobs,
   * falling back to querying the first available tenant in the database.
   */
  private resolveSystemTenantId(): string {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT id FROM tenants WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
      if (row?.id) {
        return row.id;
      }
    } catch {
      // Database might be uninitialized during setup/test
    }
    return 'system';
  }

  /**
   * Starts the recurring backup and database maintenance schedules.
   */
  public start(): void {
    if (this.isRunning || !this.config.enabled) {
      return;
    }

    this.isRunning = true;

    const backupIntervalMs = this.config.intervalHours * 3600 * 1000;
    const vacuumIntervalMs = this.config.vacuumIntervalHours * 3600 * 1000;

    this.nextScheduledBackupAt = Date.now() + backupIntervalMs;
    this.nextScheduledVacuumAt = Date.now() + vacuumIntervalMs;

    this.backupTimer = setInterval(() => {
      this.executeScheduledBackup().catch((err) => {
        process.stderr.write(`[BackupScheduler] Scheduled backup failure: ${String(err)}\n`);
      });
    }, backupIntervalMs);
    this.backupTimer.unref();

    this.vacuumTimer = setInterval(() => {
      this.executeScheduledVacuum().catch((err) => {
        process.stderr.write(`[BackupScheduler] Scheduled vacuum failure: ${String(err)}\n`);
      });
    }, vacuumIntervalMs);
    this.vacuumTimer.unref();

    process.stdout.write(
      `[BackupScheduler] Started in-process scheduler (Interval: ${this.config.intervalHours}h, Retention: ${this.config.retentionDays}d, Vacuum: ${this.config.vacuumIntervalHours}h)\n`
    );
  }

  /**
   * Stops active timers cleanly during server shutdown.
   */
  public stop(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    if (this.vacuumTimer) {
      clearInterval(this.vacuumTimer);
      this.vacuumTimer = null;
    }
    this.isRunning = false;
    this.nextScheduledBackupAt = null;
    this.nextScheduledVacuumAt = null;
  }

  /**
   * Executes a scheduled point-in-time full database backup,
   * prunes outdated backups according to retention days, and emits lifecycle events.
   *
   * @returns The created backup record or null on error.
   */
  public async executeScheduledBackup(): Promise<BackupRecord | null> {
    const tenantId = this.resolveSystemTenantId();
    const correlationId = generateUUIDv7();

    return RequestContext.run(
      {
        tenantId,
        correlationId
      },
      async () => {
        try {
          const record = await BackupService.createFullDatabaseBackup();
          this.lastBackupAt = Date.now();
          this.lastBackupStatus = 'completed';
          this.totalBackupsRun += 1;
          this.nextScheduledBackupAt = Date.now() + (this.config.intervalHours * 3600 * 1000);

          // Prune backups exceeding retention threshold
          const prunedCount = BackupService.pruneOldBackups(this.config.retentionDays);

          eventBus.publish('backup.scheduled.completed', {
            backupId: record.id,
            tenantId: record.tenant_id,
            filename: record.filename,
            fileSizeBytes: record.file_size_bytes,
            checksumSha256: record.checksum_sha256,
            prunedCount
          });

          return record;
        } catch (err: any) {
          this.lastBackupAt = Date.now();
          this.lastBackupStatus = 'failed';
          this.nextScheduledBackupAt = Date.now() + (this.config.intervalHours * 3600 * 1000);

          eventBus.publish('backup.scheduled.failed', {
            error: err?.message || 'Scheduled backup failed',
            timestamp: Date.now()
          });

          throw err;
        }
      }
    );
  }

  /**
   * Executes online WAL checkpoint and database vacuuming routine.
   *
   * @returns Performance and duration metrics.
   */
  public async executeScheduledVacuum(): Promise<{ durationMs: number; checkpointResult: string }> {
    const tenantId = this.resolveSystemTenantId();
    const correlationId = generateUUIDv7();

    return RequestContext.run(
      {
        tenantId,
        correlationId
      },
      async () => {
        try {
          const result = BackupService.vacuumDatabase();
          this.lastVacuumAt = Date.now();
          this.totalVacuumsRun += 1;
          this.nextScheduledVacuumAt = Date.now() + (this.config.vacuumIntervalHours * 3600 * 1000);

          eventBus.publish('database.vacuumed', {
            durationMs: result.durationMs,
            checkpointResult: result.checkpointResult,
            timestamp: Date.now()
          });

          return result;
        } catch (err: any) {
          process.stderr.write(`[BackupScheduler] Database vacuum routine failed: ${String(err)}\n`);
          throw err;
        }
      }
    );
  }

  /**
   * Returns current operational status and scheduler metrics.
   */
  public getStatus(): SchedulerStatus {
    return {
      enabled: this.config.enabled,
      running: this.isRunning,
      intervalHours: this.config.intervalHours,
      retentionDays: this.config.retentionDays,
      vacuumIntervalHours: this.config.vacuumIntervalHours,
      lastBackupAt: this.lastBackupAt,
      lastBackupStatus: this.lastBackupStatus,
      lastVacuumAt: this.lastVacuumAt,
      nextScheduledBackupAt: this.nextScheduledBackupAt,
      nextScheduledVacuumAt: this.nextScheduledVacuumAt,
      totalBackupsRun: this.totalBackupsRun,
      totalVacuumsRun: this.totalVacuumsRun
    };
  }
}
