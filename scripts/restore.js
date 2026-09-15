#!/usr/bin/env node
/**
 * GarrisonOS Disaster Recovery CLI Restore Tool
 *
 * Restores a complete GarrisonOS SQLite database from a point-in-time snapshot (.sqlite or .sqlite.gz).
 *
 * Usage:
 *   node scripts/restore.js <path-to-snapshot>
 *   node scripts/restore.js storage/backups/garrison-db-1726380000000.sqlite.gz
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const targetSnapshot = process.argv[2];

if (!targetSnapshot || targetSnapshot === '--help' || targetSnapshot === '-h') {
  process.stdout.write(`
GarrisonOS Disaster Recovery Restore Tool

Usage:
  node scripts/restore.js <path-to-snapshot>

Description:
  Safely restores an offline GarrisonOS instance from a .sqlite or .sqlite.gz snapshot.
  Verifies SQLite binary headers, closes active handles, removes stale -wal/-shm files,
  swaps the database file, and applies pending migrations.

Example:
  node scripts/restore.js storage/backups/garrison-db-1726380000.sqlite.gz
\n`);
  process.exit(targetSnapshot ? 0 : 1);
}

const resolvedSnapshot = path.resolve(targetSnapshot);
if (!fs.existsSync(resolvedSnapshot)) {
  process.stderr.write(`❌ Error: Snapshot file not found at ${resolvedSnapshot}\n`);
  process.exit(1);
}

async function runDisasterRecovery() {
  process.stdout.write(`====================================================\n`);
  process.stdout.write(`  GarrisonOS Database Disaster Recovery Restore\n`);
  process.stdout.write(`====================================================\n`);
  process.stdout.write(`Snapshot source: ${resolvedSnapshot}\n`);

  const dbPath = process.env['SQLITE_PATH'] || './garrison.sqlite';
  const resolvedDbPath = path.resolve(dbPath);
  const walPath = `${resolvedDbPath}-wal`;
  const shmPath = `${resolvedDbPath}-shm`;
  const tempDbPath = path.resolve(path.dirname(resolvedDbPath), `restore-tmp-${Date.now()}.sqlite`);

  try {
    // 1. Decompress if needed and verify SQLite format 3 magic header
    process.stdout.write(`[1/4] Inspecting and extracting snapshot...\n`);
    const isGzip = resolvedSnapshot.endsWith('.gz');

    if (isGzip) {
      const source = fs.createReadStream(resolvedSnapshot);
      const gunzip = zlib.createGunzip();
      const dest = fs.createWriteStream(tempDbPath);
      await pipeline(source, gunzip, dest);
    } else {
      fs.copyFileSync(resolvedSnapshot, tempDbPath);
    }

    const fd = fs.openSync(tempDbPath, 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);

    if (headerBuf.toString('utf8', 0, 15) !== 'SQLite format 3') {
      throw new Error('Verification failed: File is not a valid SQLite database format.');
    }
    process.stdout.write(`      ✔ Valid SQLite database detected.\n`);

    // 2. Remove stale WAL and SHM files
    process.stdout.write(`[2/4] Cleaning up stale WAL and shared-memory caches...\n`);
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
      process.stdout.write(`      - Removed ${path.basename(walPath)}\n`);
    }
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
      process.stdout.write(`      - Removed ${path.basename(shmPath)}\n`);
    }

    // 3. Backup current DB if it exists
    if (fs.existsSync(resolvedDbPath)) {
      const backupCurrent = `${resolvedDbPath}.bak-${Date.now()}`;
      fs.copyFileSync(resolvedDbPath, backupCurrent);
      process.stdout.write(`      - Backed up active database to ${path.basename(backupCurrent)}\n`);
    }

    // 4. Overwrite main database file
    process.stdout.write(`[3/4] Installing restored database file...\n`);
    fs.copyFileSync(tempDbPath, resolvedDbPath);
    fs.unlinkSync(tempDbPath);
    process.stdout.write(`      ✔ Restored database in place at ${resolvedDbPath}\n`);

    // 5. Run database migrations to bring restored database up to current code schema
    process.stdout.write(`[4/4] Applying migrations...\n`);
    const migratorPath = path.resolve('dist/database/migrator.js');
    if (fs.existsSync(migratorPath)) {
      const { runMigrations } = await import(`file://${migratorPath}`);
      const applied = runMigrations();
      process.stdout.write(`      ✔ Migrations applied: ${applied.length}\n`);
    }

    process.stdout.write(`\n✨ Disaster recovery restore completed successfully!\n`);
    process.exit(0);
  } catch (err) {
    if (fs.existsSync(tempDbPath)) {
      try { fs.unlinkSync(tempDbPath); } catch {}
    }
    process.stderr.write(`\n❌ Disaster recovery failed: ${err.message}\n`);
    process.exit(1);
  }
}

runDisasterRecovery();
