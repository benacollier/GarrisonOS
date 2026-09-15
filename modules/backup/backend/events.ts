import { EventBus } from '../../../core/events.js';

export function registerSubscribers(bus: EventBus): void {
  // Listen for backup lifecycle events
  bus.subscribe('backup.created', (event: any) => {
    // Graceful background handling
    process.stdout.write(`[BackupEvent] Backup created: ${event?.backupId} (${event?.backupType})\n`);
  });

  bus.subscribe('backup.failed', (event: any) => {
    process.stderr.write(`[BackupEvent] Backup failed: ${event?.error}\n`);
  });

  bus.subscribe('backup.deleted', (event: any) => {
    process.stdout.write(`[BackupEvent] Backup deleted: ${event?.backupId}\n`);
  });
}

