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

/**
 * Unpacks entries from an uncompressed POSIX ustar tar archive buffer.
 *
 * @param {Buffer} tarBuffer
 * @returns {{ name: string, data: Buffer }[]}
 */
function unpackTar(tarBuffer) {
  const entries = [];
  let offset = 0;
  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    let isEmpty = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        isEmpty = false;
        break;
      }
    }
    if (isEmpty) break;

    // Extract file name (bytes 0-99)
    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) nameEnd++;
    const baseName = header.toString('utf8', 0, nameEnd).trim();

    // Extract prefix if present (bytes 345-499)
    let prefixEnd = 345;
    while (prefixEnd < 500 && header[prefixEnd] !== 0) prefixEnd++;
    const prefix = prefixEnd > 345 ? header.toString('utf8', 345, prefixEnd).trim() : '';
    const name = prefix.length > 0 ? `${prefix}/${baseName}` : baseName;

    const sizeStr = header.toString('ascii', 124, 135).replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8);
    if (Number.isNaN(size) || size < 0) {
      throw new Error(`Corrupted tar archive: invalid size for entry '${name || 'unknown'}'`);
    }

    const typeFlag = header[156];
    offset += 512;

    if (typeFlag === 0x30 || typeFlag === 0x00) {
      if (offset + size > tarBuffer.length) {
        throw new Error(`Corrupted tar archive: truncated file entry for ${name}`);
      }
      entries.push({
        name,
        data: Buffer.from(tarBuffer.subarray(offset, offset + size))
      });
    }

    const remainder = size % 512;
    const padding = remainder > 0 ? 512 - remainder : 0;
    offset += size + padding;
  }
  return entries;
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

  const configuredStorage = process.env['STORAGE_PATH'] || './storage/uploads';
  const resolvedStorage = path.resolve(configuredStorage);
  const stagingAttachmentsDir = path.resolve(path.dirname(resolvedStorage), `.restore-media-staging-${Date.now()}`);
  let stagedAttachmentCount = 0;

  try {
    // 1. Decompress if needed and inspect snapshot format
    process.stdout.write(`[1/4] Inspecting and extracting snapshot...\n`);
    let rawBuffer = fs.readFileSync(resolvedSnapshot);
    const isGzip = resolvedSnapshot.endsWith('.gz') || (rawBuffer.length > 2 && rawBuffer[0] === 0x1f && rawBuffer[1] === 0x8b);
    if (isGzip) {
      rawBuffer = zlib.gunzipSync(rawBuffer);
    }

    const expectedSqliteHeader = Buffer.from('SQLite format 3\0');
    if (rawBuffer.length >= 16 && rawBuffer.subarray(0, 16).equals(expectedSqliteHeader)) {
      fs.writeFileSync(tempDbPath, rawBuffer);
      process.stdout.write(`      ✔ Valid SQLite database detected.\n`);
    } else {
      const entries = unpackTar(rawBuffer);
      const dbEntry = entries.find(e => e.name === 'database.sqlite' || e.name.endsWith('.sqlite'));
      if (!dbEntry) {
        throw new Error('Verification failed: Archive does not contain a database snapshot file.');
      }
      if (dbEntry.data.length < 16 || !dbEntry.data.subarray(0, 16).equals(expectedSqliteHeader)) {
        throw new Error('Verification failed: File is not a valid SQLite database format.');
      }
      fs.writeFileSync(tempDbPath, dbEntry.data);
      process.stdout.write(`      ✔ Valid SQLite database detected inside tar archive.\n`);

      // Stage media attachments safely
      fs.mkdirSync(stagingAttachmentsDir, { recursive: true });
      const normalizedStaging = path.normalize(stagingAttachmentsDir) + path.sep;

      for (const entry of entries) {
        if (entry.name.startsWith('attachments/')) {
          const relPath = entry.name.substring('attachments/'.length);
          const target = path.resolve(stagingAttachmentsDir, relPath);
          if (target.startsWith(normalizedStaging)) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, entry.data);
            stagedAttachmentCount++;
          }
        }
      }
      if (stagedAttachmentCount > 0) {
        process.stdout.write(`      ✔ Staged ${stagedAttachmentCount} media attachment file(s) for atomic restore.\n`);
      }
    }

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

    // 6. Commit staged attachments to live storage directory
    if (stagedAttachmentCount > 0 && fs.existsSync(stagingAttachmentsDir)) {
      fs.mkdirSync(resolvedStorage, { recursive: true });
      const copyRecursive = (src, dest) => {
        const items = fs.readdirSync(src, { withFileTypes: true });
        for (const item of items) {
          const s = path.join(src, item.name);
          const d = path.join(dest, item.name);
          if (item.isDirectory()) {
            fs.mkdirSync(d, { recursive: true });
            copyRecursive(s, d);
          } else if (item.isFile()) {
            fs.mkdirSync(path.dirname(d), { recursive: true });
            fs.copyFileSync(s, d);
          }
        }
      };
      copyRecursive(stagingAttachmentsDir, resolvedStorage);
      fs.rmSync(stagingAttachmentsDir, { recursive: true, force: true });
      process.stdout.write(`      ✔ Promoted ${stagedAttachmentCount} media attachment(s) to live storage.\n`);
    }

    process.stdout.write(`\n✨ Disaster recovery restore completed successfully!\n`);
    process.exit(0);
  } catch (err) {
    if (fs.existsSync(tempDbPath)) {
      try { fs.unlinkSync(tempDbPath); } catch {}
    }
    if (fs.existsSync(stagingAttachmentsDir)) {
      try { fs.rmSync(stagingAttachmentsDir, { recursive: true, force: true }); } catch {}
    }
    process.stderr.write(`\n❌ Disaster recovery failed: ${err.message}\n`);
    process.exit(1);
  }
}

runDisasterRecovery();
