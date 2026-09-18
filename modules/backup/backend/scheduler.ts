import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';
import { eventBus } from '../../../core/events.js';
import { getDatabase } from '../../../database/client.js';
import { BackupRecord } from './repository.js';
import { BackupService } from './service.js';

/**
 * Configuration options governing the background backup scheduler.
 */
export interface SchedulerConfig {
  /**
   * Whether the background scheduler is active.
   */
  enabled: boolean;

  /**
   * Interval in hours between automated full system backups.
   */
  intervalHours: number;

  /**
   * Number of days to retain backups before pruning.
   */
  retentionDays: number;

  /**
   * Interval in hours between automated database vacuum and maintenance routines.
   */
  vacuumIntervalHours: number;
}

/**
 * Operational metrics and status details for the background backup scheduler.
 */
export interface SchedulerStatus {
  /**
   * Whether the scheduler is configured as enabled.
   */
  enabled: boolean;

  /**
   * Whether background timers are currently running.
   */
  running: boolean;

  /**
   * Configured backup interval in hours.
   */
  intervalHours: number;

  /**
   * Configured retention period in days.
   */
  retentionDays: number;

  /**
   * Configured vacuum interval in hours.
   */
  vacuumIntervalHours: number;

  /**
   * Epoch millisecond timestamp of the last executed backup, or null.
   */
  lastBackupAt: number | null;

  /**
   * Status of the last executed backup.
   */
  lastBackupStatus: 'completed' | 'failed' | null;

  /**
   * Epoch millisecond timestamp of the last executed vacuum routine, or null.
   */
  lastVacuumAt: number | null;

  /**
   * Epoch millisecond timestamp of the next scheduled backup run, or null.
   */
  nextScheduledBackupAt: number | null;

  /**
   * Epoch millisecond timestamp of the next scheduled vacuum routine, or null.
   */
  nextScheduledVacuumAt: number | null;

  /**
   * Cumulative count of automated backups executed since boot.
   */
  totalBackupsRun: number;

  /**
   * Cumulative count of vacuum routines executed since boot.
   */
  totalVacuumsRun: number;

  /**
   * Type of maintenance currently in progress, or null if idle.
   */
  maintenanceInProgress: 'backup' | 'vacuum' | null;
}

const MAX_INTERVAL_HOURS = 596;

/**
 * Validate scheduler values after defaults, environment values, and overrides are merged.
 *
 * @param config Final scheduler configuration.
 * @throws Error when an interval cannot be represented safely by a Node.js timer or retention is invalid.
 */
function validateSchedulerConfig(config: SchedulerConfig): void {
  const intervals: Array<[string, number]> = [
    ['intervalHours', config.intervalHours],
    ['vacuumIntervalHours', config.vacuumIntervalHours]
  ];

  for (const [name, value] of intervals) {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_INTERVAL_HOURS) {
      throw new Error(`${name} must be greater than 0 and no more than ${MAX_INTERVAL_HOURS} hours`);
    }
  }

  if (!Number.isFinite(config.retentionDays) || config.retentionDays <= 0) {
    throw new Error('retentionDays must be greater than 0');
  }
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
  private maintenanceInProgress: 'backup' | 'vacuum' | null = null;
  private activeBackupPromise: Promise<BackupRecord | null> | null = null;
  private activeVacuumPromise: Promise<{ durationMs: number; checkpointResult: string }> | null = null;

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
    const intervalHours = envInterval !== undefined ? Number(envInterval) : 24;

    const envRetention = process.env['BACKUP_RETENTION_DAYS'];
    const retentionDays = envRetention !== undefined ? Number(envRetention) : 30;

    const envVacuumInterval = process.env['BACKUP_VACUUM_INTERVAL_HOURS'];
    const vacuumIntervalHours = envVacuumInterval !== undefined
      ? Number(envVacuumInterval)
      : 168; // Default weekly (7 days)

    const config = {
      enabled: customConfig.enabled !== undefined ? customConfig.enabled : isEnabled,
      intervalHours: customConfig.intervalHours ?? intervalHours,
      retentionDays: customConfig.retentionDays ?? retentionDays,
      vacuumIntervalHours: customConfig.vacuumIntervalHours ?? vacuumIntervalHours
    };
    validateSchedulerConfig(config);
    this.config = config;
  }

  /**
   * Retrieves the singleton BackupScheduler instance, initializing it if necessary.
   *
   * @param config - Optional configuration overrides.
   * @returns The singleton BackupScheduler instance.
   */
  public static getInstance(config?: Partial<SchedulerConfig>): BackupScheduler {
    if (!BackupScheduler.instance) {
      BackupScheduler.instance = new BackupScheduler(config);
    }
    return BackupScheduler.instance;
  }

  /**
   * Resolve an existing operator ID for system background jobs,
   * falling back to querying the first available operator in the database.
   */
  private resolveSystemOperatorId(): string {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT id FROM operators WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
      if (row?.id) {
        return row.id;
      }
    } catch {
      // Database might be uninitialized during setup/test
    }
    return 'system';
  }

  private resolveSystemTenantId(): string {
    return this.resolveSystemOperatorId();
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
  public async stop(): Promise<void> {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    if (this.vacuumTimer) {
      clearInterval(this.vacuumTimer);
      this.vacuumTimer = null;
    }
    this.isRunning = false;

    const activeOperations: Promise<unknown>[] = [];
    if (this.activeBackupPromise) {
      activeOperations.push(this.activeBackupPromise);
    }
    if (this.activeVacuumPromise) {
      activeOperations.push(this.activeVacuumPromise);
    }
    await Promise.allSettled(activeOperations);

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
    if (this.maintenanceInProgress) {
      throw new Error(
        `Cannot start backup while ${this.maintenanceInProgress} maintenance is in progress`
      );
    }

    this.maintenanceInProgress = 'backup';
    const operation = this.runScheduledBackup();
    this.activeBackupPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.activeBackupPromise === operation) {
        this.activeBackupPromise = null;
      }
      this.maintenanceInProgress = null;
    }
  }

  /**
   * Run a full scheduled backup inside the scheduler's system request context.
   *
   * @returns The completed backup record.
   */
  private async runScheduledBackup(): Promise<BackupRecord | null> {
    const operatorId = this.resolveSystemOperatorId();
    const correlationId = generateUUIDv7();

    return RequestContext.run(
      {
        operatorId,
        tenantId: operatorId,
        correlationId
      },
      async () => {
        let record: BackupRecord;
        try {
          record = await BackupService.createFullDatabaseBackup();
          this.lastBackupAt = Date.now();
          this.lastBackupStatus = 'completed';
          this.totalBackupsRun += 1;
          this.nextScheduledBackupAt = Date.now() + (this.config.intervalHours * 3600 * 1000);
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

        let prunedCount = 0;
        try {
          prunedCount = BackupService.pruneOldBackups(this.config.retentionDays);
        } catch (err: any) {
          process.stderr.write(`[BackupScheduler] Backup retention pruning failed: ${String(err)}\n`);
          eventBus.publish('backup.retention.failed', {
            backupId: record.id,
            error: err?.message || 'Backup retention pruning failed',
            timestamp: Date.now()
          });
        }

        eventBus.publish('backup.scheduled.completed', {
          backupId: record.id,
          operatorId: record.operator_id,
          tenantId: record.operator_id,
          filename: record.filename,
          fileSizeBytes: record.file_size_bytes,
          checksumSha256: record.checksum_sha256,
          prunedCount
        });

        return record;
      }
    );
  }

  /**
   * Executes online WAL checkpoint and database vacuuming routine.
   *
   * @returns Performance and duration metrics.
   */
  public async executeScheduledVacuum(): Promise<{ durationMs: number; checkpointResult: string }> {
    if (this.maintenanceInProgress) {
      throw new Error(
        `Cannot start vacuum while ${this.maintenanceInProgress} maintenance is in progress`
      );
    }

    this.maintenanceInProgress = 'vacuum';
    const operation = this.runScheduledVacuum();
    this.activeVacuumPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.activeVacuumPromise === operation) {
        this.activeVacuumPromise = null;
      }
      this.maintenanceInProgress = null;
    }
  }

  /**
   * Run database maintenance inside the scheduler's system request context.
   *
   * @returns Performance and duration metrics from the maintenance worker.
   */
  private async runScheduledVacuum(): Promise<{ durationMs: number; checkpointResult: string }> {
    const operatorId = this.resolveSystemOperatorId();
    const correlationId = generateUUIDv7();

    return RequestContext.run(
      {
        operatorId,
        tenantId: operatorId,
        correlationId
      },
      async () => {
        try {
          const result = await BackupService.vacuumDatabase();
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
      totalVacuumsRun: this.totalVacuumsRun,
      maintenanceInProgress: this.maintenanceInProgress
    };
  }
}
