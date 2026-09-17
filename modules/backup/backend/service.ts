import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Worker } from 'node:worker_threads';
import { getDatabase, closeDatabase, withTransaction } from '../../../database/client.js';
import { runMigrations } from '../../../database/migrator.js';
import { RequestContext } from '../../../core/context.js';
import { getApplicationVersion } from '../../../core/version.js';
import { BackupRecord, BackupRepository } from './repository.js';

export interface RestoreOperatorOptions {
  mode: 'clean_slate' | 'merge';
}

export type RestoreTenantOptions = RestoreOperatorOptions;

export interface RestoreOperatorResult {
  success: boolean;
  restoredTables: { [tableName: string]: number };
  mode: 'clean_slate' | 'merge';
}

export type RestoreTenantResult = RestoreOperatorResult;

export class BackupService {
  public static getBackupDir(): string {
    const baseStorage = process.env['STORAGE_PATH'] || './storage';
    const backupDir = path.resolve(baseStorage, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    return backupDir;
  }

  public static resolveSafeBackupPath(relativePath: string): string {
    const backupDir = this.getBackupDir();
    const resolvedPath = path.resolve(backupDir, relativePath);
    const normalizedBackupDir = path.normalize(backupDir) + path.sep;
    if (!resolvedPath.startsWith(normalizedBackupDir) && resolvedPath !== backupDir) {
      throw new Error(`Path traversal attempt detected: ${relativePath}`);
    }
    return resolvedPath;
  }

  public static async calculateSha256(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  public static async createFullDatabaseBackup(): Promise<BackupRecord> {
    const operatorId = RequestContext.getOperatorId();
    const timestamp = Date.now();
    const filename = `garrison-db-${timestamp}.sqlite.gz`;
    const relativePath = filename;
    const backupDir = this.getBackupDir();
    const targetCompressedPath = path.join(backupDir, filename);
    const tempSnapshotPath = path.join(backupDir, `snapshot-tmp-${timestamp}.sqlite`);

    const record = BackupRepository.create({
      backup_type: 'full_system',
      filename,
      relative_path: relativePath,
      metadata_json: JSON.stringify({ operator_id: operatorId, tenant_id: operatorId, mode: 'full_sqlite_snapshot' })
    });

    try {
      const db = getDatabase();
      // Ensure WAL changes are checkpointed
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

      // SQLite safe online vacuum backup
      const vacuumStmt = db.prepare('VACUUM INTO ?');
      vacuumStmt.run(tempSnapshotPath);

      // Compress snapshot with gzip
      const sourceStream = fs.createReadStream(tempSnapshotPath);
      const gzipStream = zlib.createGzip({ level: 9 });
      const destStream = fs.createWriteStream(targetCompressedPath);

      await pipeline(sourceStream, gzipStream, destStream);

      // Clean up uncompressed snapshot
      if (fs.existsSync(tempSnapshotPath)) {
        fs.unlinkSync(tempSnapshotPath);
      }

      // Calculate file size and checksum
      const stats = fs.statSync(targetCompressedPath);
      const checksum = await this.calculateSha256(targetCompressedPath);

      const updated = BackupRepository.updateStatus(record.id, {
        status: 'completed',
        file_size_bytes: stats.size,
        checksum_sha256: checksum
      });

      return updated!;
    } catch (err: any) {
      if (fs.existsSync(tempSnapshotPath)) {
        try { fs.unlinkSync(tempSnapshotPath); } catch {}
      }
      if (fs.existsSync(targetCompressedPath)) {
        try { fs.unlinkSync(targetCompressedPath); } catch {}
      }

      BackupRepository.updateStatus(record.id, {
        status: 'failed',
        error_message: err.message || 'Full database backup failed'
      });

      throw err;
    }
  }

  public static async createOperatorExport(): Promise<BackupRecord> {
    const operatorId = RequestContext.getOperatorId();
    const timestamp = Date.now();
    const filename = `operator-${operatorId}-export-${timestamp}.json.gz`;
    const relativePath = filename;
    const backupDir = this.getBackupDir();
    const targetPath = path.join(backupDir, filename);

    const record = BackupRepository.create({
      backup_type: 'operator_data',
      filename,
      relative_path: relativePath,
      metadata_json: JSON.stringify({ operator_id: operatorId, tenant_id: operatorId, mode: 'operator_data_export' })
    });

    try {
      const db = getDatabase();
      
      // Discover operator-scoped tables dynamically
      const tables = db.prepare(`
        SELECT DISTINCT m.name as table_name,
          SUM(CASE WHEN p.name = 'operator_id' THEN 1 ELSE 0 END) as has_operator_id,
          SUM(CASE WHEN p.name = 'tenant_id' THEN 1 ELSE 0 END) as has_tenant_id
        FROM sqlite_master m
        JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table' AND (p.name = 'operator_id' OR p.name = 'tenant_id')
          AND m.name <> 'backups' AND m.name <> 'tenants'
        GROUP BY m.name
      `).all() as { table_name: string; has_operator_id: number; has_tenant_id: number }[];

      const exportData: Record<string, any[]> = {
        _export_metadata: [{
          operator_id: operatorId,
          tenant_id: operatorId,
          exported_at: timestamp,
          version: getApplicationVersion()
        }]
      };

      for (const { table_name, has_operator_id } of tables) {
        const idCol = has_operator_id > 0 ? 'operator_id' : 'tenant_id';
        // hygiene-exempt: dynamic table identifier from sqlite_master whitelist
        const rows = db.prepare(`SELECT * FROM "${table_name}" WHERE "${idCol}" = ?`).all(operatorId);
        exportData[table_name] = rows;
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const compressedBuffer = zlib.gzipSync(Buffer.from(jsonString, 'utf8'), { level: 9 });
      fs.writeFileSync(targetPath, compressedBuffer);

      const stats = fs.statSync(targetPath);
      const checksum = await this.calculateSha256(targetPath);

      const updated = BackupRepository.updateStatus(record.id, {
        status: 'completed',
        file_size_bytes: stats.size,
        checksum_sha256: checksum,
        metadata_json: JSON.stringify({
          operator_id: operatorId,
          tenant_id: operatorId,
          mode: 'operator_data_export',
          tables_count: tables.length,
          tables: tables.map((t) => t.table_name)
        })
      });

      return updated!;
    } catch (err: any) {
      if (fs.existsSync(targetPath)) {
        try { fs.unlinkSync(targetPath); } catch {}
      }

      BackupRepository.updateStatus(record.id, {
        status: 'failed',
        error_message: err.message || 'Operator export failed'
      });

      throw err;
    }
  }

  public static async createTenantExport(): Promise<BackupRecord> {
    return this.createOperatorExport();
  }

  public static async verifyBackupIntegrity(backupId: string): Promise<{ valid: boolean; calculatedSha256: string; record: BackupRecord }> {
    const record = BackupRepository.getById(backupId);
    if (!record) {
      throw new Error(`Backup with ID ${backupId} not found`);
    }

    if (record.status !== 'completed') {
      return { valid: false, calculatedSha256: '', record };
    }

    const fullPath = this.resolveSafeBackupPath(record.relative_path);
    if (!fs.existsSync(fullPath)) {
      return { valid: false, calculatedSha256: '', record };
    }

    const calculatedSha256 = await this.calculateSha256(fullPath);
    const valid = calculatedSha256 === record.checksum_sha256;

    return { valid, calculatedSha256, record };
  }

  public static deleteBackup(backupId: string): boolean {
    const record = BackupRepository.getById(backupId);
    if (!record) {
      return false;
    }

    // Attempt physical deletion if file exists
    try {
      const fullPath = this.resolveSafeBackupPath(record.relative_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      // Continue with soft-delete even if physical delete encountered error
    }

    return BackupRepository.softDelete(backupId);
  }

  public static pruneOldBackups(retentionDays: number): number {
    const oldBackups = BackupRepository.getOldBackups(retentionDays);
    let pruned = 0;
    for (const b of oldBackups) {
      if (this.deleteBackup(b.id)) {
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Performs an online WAL checkpoint and database vacuuming maintenance routine.
   * Checkpoints pending WAL frames and reclaims unused database pages.
   *
   * @returns Performance and vacuum completion metrics.
   */
  public static vacuumDatabase(): Promise<{ durationMs: number; checkpointResult: string }> {
    const databasePath = process.env['SQLITE_PATH'] || './garrison.sqlite';

    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./maintenance-worker.js', import.meta.url), {
        workerData: { databasePath }
      });
      let settled = false;

      worker.once('message', (message: unknown) => {
        settled = true;
        const result = message as {
          success?: boolean;
          durationMs?: number;
          checkpointResult?: string;
          error?: string;
        };
        if (
          result.success === true &&
          typeof result.durationMs === 'number' &&
          typeof result.checkpointResult === 'string'
        ) {
          resolve({
            durationMs: result.durationMs,
            checkpointResult: result.checkpointResult
          });
        } else {
          reject(new Error(result.error || 'Database maintenance worker returned an invalid response'));
        }
      });

      worker.once('error', (err) => {
        settled = true;
        reject(err);
      });

      worker.once('exit', (code) => {
        if (!settled) {
          reject(new Error(`Database maintenance worker exited before reporting a result (code ${code})`));
        }
      });
    });
  }

  /**
   * Restore operator data from a backup archive buffer or on-disk backup ID.
   * Options:
   *  - clean_slate: Replaces all operator records in the backed up tables before inserting.
   *  - merge: Inserts or replaces records without deleting unmentioned operator records.
   */
  public static async restoreOperatorData(
    source: { backupId?: string; compressedBuffer?: Buffer },
    options: RestoreOperatorOptions = { mode: 'clean_slate' }
  ): Promise<RestoreOperatorResult> {
    const operatorId = RequestContext.getOperatorId();

    let rawBuffer: Buffer;
    if (source.backupId) {
      const record = BackupRepository.getById(source.backupId);
      if (!record) {
        throw new Error(`Backup record not found: ${source.backupId}`);
      }
      if (record.backup_type !== 'operator_data' && record.backup_type !== 'tenant_data') {
        throw new Error(`Only operator_data backups can be restored into an active operator session`);
      }
      const fullPath = this.resolveSafeBackupPath(record.relative_path);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Backup file missing from storage`);
      }
      rawBuffer = fs.readFileSync(fullPath);
    } else if (source.compressedBuffer) {
      rawBuffer = source.compressedBuffer;
    } else {
      throw new Error('Either backupId or compressedBuffer must be provided');
    }

    // Decompress and parse JSON
    let exportData: Record<string, any[]>;
    try {
      const jsonText = zlib.gunzipSync(rawBuffer).toString('utf8');
      exportData = JSON.parse(jsonText);
    } catch (err: any) {
      throw new Error(`Failed to decompress and parse backup archive: ${err.message}`);
    }

    // Verify operator isolation metadata
    const metadata = exportData['_export_metadata'];
    const metaOpId = metadata?.[0]?.operator_id || metadata?.[0]?.tenant_id;
    if (!Array.isArray(metadata) || metadata.length === 0 || metaOpId !== operatorId) {
      throw new Error(
        `Cross-operator restore prohibited: archive operator_id '${metaOpId}' does not match active operator_id '${operatorId}'`
      );
    }

    const restoredTables: { [tableName: string]: number } = {};

    // Execute atomic transaction for safe rollback
    withTransaction((tx) => {
      // Find all operational operator-scoped tables that are safe to restore
      const dbTables = tx.prepare(`
        SELECT DISTINCT m.name as table_name,
          SUM(CASE WHEN p.name = 'operator_id' THEN 1 ELSE 0 END) as has_operator_id,
          SUM(CASE WHEN p.name = 'tenant_id' THEN 1 ELSE 0 END) as has_tenant_id
        FROM sqlite_master m
        JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table' AND (p.name = 'operator_id' OR p.name = 'tenant_id')
          AND m.name <> 'backups' AND m.name <> 'tenants'
        GROUP BY m.name
      `).all() as { table_name: string; has_operator_id: number; has_tenant_id: number }[];

      const tableInfoMap = new Map(dbTables.map((t) => [t.table_name, t]));

      // 1. If clean_slate mode, delete existing operator records from tables in reverse order
      if (options.mode === 'clean_slate') {
        for (const tableName of Object.keys(exportData)) {
          if (tableName === '_export_metadata' || !tableInfoMap.has(tableName)) continue;
          const info = tableInfoMap.get(tableName)!;
          const idCol = info.has_operator_id > 0 ? 'operator_id' : 'tenant_id';
          tx.prepare(`DELETE FROM "${tableName}" WHERE "${idCol}" = ?`).run(operatorId);
        }
      }

      // Tables with operator-scoped natural / compound unique constraints:
      // In merge mode, if a row in the backup shares the natural key with an existing target row having a different id,
      // resolve the conflict beforehand so the backup's record replaces it cleanly.
      const naturalKeyLookups: Record<string, string[]> = {
        users: ['operator_id', 'email'],
        lease_contacts: ['operator_id', 'lease_id', 'contact_id'],
        journal_entries: ['operator_id', 'entry_number']
      };

      // 2. Insert records table by table
      for (const [tableName, rows] of Object.entries(exportData)) {
        if (tableName === '_export_metadata' || !tableInfoMap.has(tableName) || !Array.isArray(rows)) {
          continue;
        }

        const tableInfo = tableInfoMap.get(tableName)!;
        const naturalKeys = naturalKeyLookups[tableName];

        let insertedCount = 0;
        for (const row of rows) {
          if (typeof row !== 'object' || row === null) continue;

          // Enforce operator_id matches active context
          const sanitizedRow = { ...row };
          if (tableInfo.has_operator_id > 0) {
            sanitizedRow['operator_id'] = operatorId;
          }
          if (tableInfo.has_tenant_id > 0) {
            sanitizedRow['tenant_id'] = operatorId;
          }
          const cols = Object.keys(sanitizedRow);
          if (cols.length === 0) continue;

          // If merge mode and table has natural key columns, delete any existing record with matching natural key and differing id
          if (options.mode === 'merge' && naturalKeys && sanitizedRow['id']) {
            const hasAllKeys = naturalKeys.every(k => sanitizedRow[k] !== undefined);
            if (hasAllKeys) {
              const whereClause = naturalKeys.map(k => `"${k}" = ?`).join(' AND ') + ' AND "id" <> ?';
              const params = [...naturalKeys.map(k => sanitizedRow[k]), sanitizedRow['id']];
              tx.prepare(`DELETE FROM "${tableName}" WHERE ${whereClause}`).run(...params);
            }
          }

          const placeholders = cols.map(() => '?').join(', ');
          const colNames = cols.map((c) => `"${c}"`).join(', ');
          const values = cols.map((c) => sanitizedRow[c]);

          // Use ANSI-compliant ON CONFLICT (id) DO UPDATE to support both merge and clean_slate cleanly
          const updateSet = cols.filter(c => c !== 'id').map(c => `"${c}" = excluded."${c}"`).join(', ');
          const insertSql = updateSet.length > 0
            ? `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet}`
            : `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;
          tx.prepare(insertSql).run(...values);
          insertedCount++;
        }

        restoredTables[tableName] = insertedCount;
      }
    });

    return {
      success: true,
      restoredTables,
      mode: options.mode
    };
  }

  public static async restoreTenantData(
    source: { backupId?: string; compressedBuffer?: Buffer },
    options: RestoreTenantOptions = { mode: 'clean_slate' }
  ): Promise<RestoreTenantResult> {
    return this.restoreOperatorData(source, options);
  }

  /**
   * Disaster Recovery: Restores the full SQLite database from a .sqlite.gz snapshot.
   * Safely removes active WAL/SHM handles, swaps files, and re-applies any pending migrations.
   */
  public static async restoreFullDatabase(sourcePath: string): Promise<void> {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Snapshot file not found: ${sourcePath}`);
    }

    const dbPath = process.env['SQLITE_PATH'] || './garrison.sqlite';
    const resolvedDbPath = path.resolve(dbPath);
    const walPath = `${resolvedDbPath}-wal`;
    const shmPath = `${resolvedDbPath}-shm`;

    // 1. Decompress snapshot to a temporary verification file
    const tempDbPath = path.resolve(path.dirname(resolvedDbPath), `restore-tmp-${Date.now()}.sqlite`);
    try {
      const sourceStream = fs.createReadStream(sourcePath);
      const isGzip = sourcePath.endsWith('.gz');

      if (isGzip) {
        const gunzipStream = zlib.createGunzip();
        const destStream = fs.createWriteStream(tempDbPath);
        await pipeline(sourceStream, gunzipStream, destStream);
      } else {
        const destStream = fs.createWriteStream(tempDbPath);
        await pipeline(sourceStream, destStream);
      }

      // Verify SQLite header magic bytes (first 16 bytes: "SQLite format 3\0")
      const fd = fs.openSync(tempDbPath, 'r');
      const headerBuf = Buffer.alloc(16);
      fs.readSync(fd, headerBuf, 0, 16, 0);
      fs.closeSync(fd);

      if (headerBuf.toString('utf8', 0, 15) !== 'SQLite format 3') {
        throw new Error('Invalid SQLite database header in restored snapshot');
      }

      // 2. Close active database connections
      closeDatabase();

      // 3. Remove stale WAL and SHM files
      if (fs.existsSync(walPath)) {
        try { fs.unlinkSync(walPath); } catch {}
      }
      if (fs.existsSync(shmPath)) {
        try { fs.unlinkSync(shmPath); } catch {}
      }

      // 4. Overwrite main database file
      fs.copyFileSync(tempDbPath, resolvedDbPath);

      // Clean up temp file
      try { fs.unlinkSync(tempDbPath); } catch {}

      // 5. Re-open database and run migrations to catch up any newer schema changes
      const db = getDatabase();
      runMigrations(db);
    } catch (err: any) {
      if (fs.existsSync(tempDbPath)) {
        try { fs.unlinkSync(tempDbPath); } catch {}
      }
      throw err;
    }
  }
}
