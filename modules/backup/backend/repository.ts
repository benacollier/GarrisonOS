import { getDatabase } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

export interface BackupRecord {
  id: string;
  tenant_id: string;
  backup_type: 'full_system' | 'tenant_data';
  filename: string;
  relative_path: string;
  file_size_bytes: number;
  checksum_sha256: string;
  status: 'pending' | 'completed' | 'failed';
  error_message: string | null;
  metadata_json: string | null;
  created_at: number;
  deleted_at: number | null;
}

export interface CreateBackupInput {
  backup_type: 'full_system' | 'tenant_data';
  filename: string;
  relative_path: string;
  metadata_json?: string | null;
}

export interface UpdateBackupStatusInput {
  status: 'completed' | 'failed';
  file_size_bytes?: number;
  checksum_sha256?: string;
  error_message?: string | null;
  metadata_json?: string | null;
}

export class BackupRepository {
  public static create(input: CreateBackupInput): BackupRecord {
    const tenantId = RequestContext.getTenantId();
    const id = generateUUIDv7();
    const now = Date.now();
    const db = getDatabase();

    db.prepare(`
      INSERT INTO backups (
        id, tenant_id, backup_type, filename, relative_path,
        file_size_bytes, checksum_sha256, status, error_message,
        metadata_json, created_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, 0, '', 'pending', NULL, ?, ?, NULL)
    `).run(
      id,
      tenantId,
      input.backup_type,
      input.filename,
      input.relative_path,
      input.metadata_json ?? null,
      now
    );

    return this.getById(id)!;
  }

  public static getById(id: string): BackupRecord | null {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    const row = db.prepare(`
      SELECT * FROM backups
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).get(id, tenantId) as unknown as BackupRecord | undefined;

    return row || null;
  }

  public static updateStatus(id: string, update: UpdateBackupStatusInput): BackupRecord | null {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    db.prepare(`
      UPDATE backups
      SET status = ?,
          file_size_bytes = COALESCE(?, file_size_bytes),
          checksum_sha256 = COALESCE(?, checksum_sha256),
          error_message = ?,
          metadata_json = COALESCE(?, metadata_json)
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).run(
      update.status,
      update.file_size_bytes ?? null,
      update.checksum_sha256 ?? null,
      update.error_message ?? null,
      update.metadata_json ?? null,
      id,
      tenantId
    );

    return this.getById(id);
  }

  public static list(limit: number = 50, offset: number = 0): { items: BackupRecord[]; total: number } {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    const totalRow = db.prepare(`
      SELECT COUNT(*) as count FROM backups
      WHERE tenant_id = ? AND deleted_at IS NULL
    `).get(tenantId) as unknown as { count: number } | undefined;

    const items = db.prepare(`
      SELECT * FROM backups
      WHERE tenant_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(tenantId, limit, offset) as unknown as BackupRecord[];

    return {
      items,
      total: totalRow ? totalRow.count : 0
    };
  }

  public static softDelete(id: string): boolean {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE backups
      SET deleted_at = ?
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).run(Date.now(), id, tenantId);

    return (result as { changes: number }).changes > 0;
  }

  public static getOldBackups(retentionDays: number): BackupRecord[] {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const thresholdMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    return db.prepare(`
      SELECT * FROM backups
      WHERE tenant_id = ? AND created_at < ? AND deleted_at IS NULL
    `).all(tenantId, thresholdMs) as unknown as BackupRecord[];
  }
}

