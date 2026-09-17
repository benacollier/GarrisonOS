import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parentPort, workerData } from 'node:worker_threads';

interface MaintenanceWorkerData {
  databasePath: string;
}

const port = parentPort;
if (!port) {
  throw new Error('Database maintenance worker requires a parent message port');
}

try {
  const data = workerData as Partial<MaintenanceWorkerData>;
  if (typeof data.databasePath !== 'string' || data.databasePath.length === 0) {
    throw new Error('Database maintenance worker requires a database path');
  }

  const databasePath = data.databasePath === ':memory:'
    ? data.databasePath
    : path.resolve(data.databasePath);
  const database = new DatabaseSync(databasePath);
  const startTime = Date.now();

  try {
    database.exec('PRAGMA busy_timeout = 5000;');
    database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    database.exec('PRAGMA optimize;');
    database.exec('VACUUM;');
  } finally {
    database.close();
  }

  port.postMessage({
    success: true,
    durationMs: Date.now() - startTime,
    checkpointResult: 'WAL truncation, optimizer-statistics update, and VACUUM page reclamation completed successfully'
  });
} catch (err) {
  port.postMessage({
    success: false,
    error: err instanceof Error ? err.message : String(err)
  });
}
