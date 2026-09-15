import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { getDatabase } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { BackupRecord, BackupRepository } from './repository.js';

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
    const tenantId = RequestContext.getTenantId();
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
      metadata_json: JSON.stringify({ tenant_id: tenantId, mode: 'full_sqlite_snapshot' })
    });

    try {
      const db = getDatabase();
      // Ensure WAL changes are checkpointed
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

      // SQLite safe online vacuum backup
      // Parameterized VACUUM INTO is supported in SQLite
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
        error_message: err.message || 'Backup creation failed'
      });

      throw err;
    }
  }

  public static async createTenantExport(): Promise<BackupRecord> {
    const tenantId = RequestContext.getTenantId();
    const timestamp = Date.now();
    const filename = `tenant-${tenantId}-export-${timestamp}.json.gz`;
    const relativePath = filename;
    const backupDir = this.getBackupDir();
    const targetPath = path.join(backupDir, filename);

    const record = BackupRepository.create({
      backup_type: 'tenant_data',
      filename,
      relative_path: relativePath,
      metadata_json: JSON.stringify({ tenant_id: tenantId, mode: 'tenant_data_export' })
    });

    try {
      const db = getDatabase();
      
      // Discover tenant-scoped tables dynamically
      const tables = db.prepare(`
        SELECT DISTINCT m.name as table_name
        FROM sqlite_master m
        JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table' AND p.name = 'tenant_id' AND m.name != 'backups'
      `).all() as { table_name: string }[];

      const exportData: Record<string, any[]> = {
        _export_metadata: [{
          tenant_id: tenantId,
          exported_at: timestamp,
          version: '1.0.0'
        }]
      };

      for (const { table_name } of tables) {
        const rows = db.prepare(`SELECT * FROM "${table_name}" WHERE tenant_id = ?`).all(tenantId);
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
          tenant_id: tenantId,
          mode: 'tenant_data_export',
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
        error_message: err.message || 'Tenant export failed'
      });

      throw err;
    }
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
}
