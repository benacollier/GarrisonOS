import { getDatabase } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

/**
 * Backup metadata record entity.
 */
export interface BackupRecord {
  /** Unique backup identifier (UUIDv7). */
  id: string;
  /** Primary operator isolation identifier. */
  operator_id: string;
  /** Legacy tenant isolation identifier (backward-compatibility alias). */
  tenant_id?: string;
  /** Scope of the backup snapshot. */
  backup_type: 'full_system' | 'operator_data' | 'tenant_data';
  /** Base filename of the backup archive. */
  filename: string;
  /** Relative storage path within the backup repository. */
  relative_path: string;
  /** Compressed archive file size in bytes. */
  file_size_bytes: number;
  /** SHA-256 cryptographic digest of the archive. */
  checksum_sha256: string;
  /** Current processing state. */
  status: 'pending' | 'completed' | 'failed';
  /** Error details if the backup operation failed. */
  error_message: string | null;
  /** Serialized JSON metadata describing snapshot contents. */
  metadata_json: string | null;
  /** Creation timestamp in epoch milliseconds. */
  created_at: number;
  /** Soft-deletion timestamp in epoch milliseconds, or null if active. */
  deleted_at: number | null;
}

/**
 * Input arguments for creating a pending backup record.
 */
export interface CreateBackupInput {
  /** Scope of the backup snapshot. */
  backup_type: 'full_system' | 'operator_data' | 'tenant_data';
  /** Base filename of the archive. */
  filename: string;
  /** Relative storage path. */
  relative_path: string;
  /** Optional serialized metadata. */
  metadata_json?: string | null;
}

/**
 * Input arguments for updating the status of an existing backup.
 */
export interface UpdateBackupStatusInput {
  /** Final completion or failure state. */
  status: 'completed' | 'failed';
  /** Compressed archive file size in bytes. */
  file_size_bytes?: number;
  /** Computed SHA-256 checksum string. */
  checksum_sha256?: string;
  /** Optional error message on failure. */
  error_message?: string | null;
  /** Updated serialized metadata. */
  metadata_json?: string | null;
}

/**
 * Repository managing persistence of database snapshots and operator exports.
 */
export class BackupRepository {
  /**
   * Insert a new pending backup record for the active operator.
   *
   * @param input - Initial metadata and archive paths.
   * @returns Created backup record with populated identifier.
   */
  public static create(input: CreateBackupInput): BackupRecord {
    const operatorId = RequestContext.getOperatorId();
    const id = generateUUIDv7();
    const now = Date.now();
    const db = getDatabase();

    db.prepare(`
      INSERT INTO backups (
        id, operator_id, backup_type, filename, relative_path,
        file_size_bytes, checksum_sha256, status, error_message,
        metadata_json, created_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, 0, '', 'pending', NULL, ?, ?, NULL)
    `).run(
      id,
      operatorId,
      input.backup_type,
      input.filename,
      input.relative_path,
      input.metadata_json ?? null,
      now
    );

    return this.getById(id)!;
  }

  /**
   * Retrieve a backup record by identifier within the active operator context.
   *
   * @param id - Backup identifier.
   * @returns Backup record or null if not found.
   */
  public static getById(id: string): BackupRecord | null {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();

    const row = db.prepare(`
      SELECT *, operator_id AS tenant_id FROM backups
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).get(id, operatorId) as unknown as BackupRecord | undefined;

    return row || null;
  }

  /**
   * Update the execution status and computed metrics for a backup.
   *
   * @param id - Backup identifier.
   * @param update - Status, size, checksum, and error details.
   * @returns Updated backup record or null if not found.
   */
  public static updateStatus(id: string, update: UpdateBackupStatusInput): BackupRecord | null {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();

    db.prepare(`
      UPDATE backups
      SET status = ?,
          file_size_bytes = COALESCE(?, file_size_bytes),
          checksum_sha256 = COALESCE(?, checksum_sha256),
          error_message = ?,
          metadata_json = COALESCE(?, metadata_json)
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(
      update.status,
      update.file_size_bytes ?? null,
      update.checksum_sha256 ?? null,
      update.error_message ?? null,
      update.metadata_json ?? null,
      id,
      operatorId
    );

    return this.getById(id);
  }

  /**
   * List paginated backup records for the active operator.
   *
   * @param limit - Maximum items to return.
   * @param offset - Query pagination offset.
   * @returns Array of backups and total matching count.
   */
  public static list(limit: number = 50, offset: number = 0): { items: BackupRecord[]; total: number } {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();

    const totalRow = db.prepare(`
      SELECT COUNT(*) as count FROM backups
      WHERE operator_id = ? AND deleted_at IS NULL
    `).get(operatorId) as unknown as { count: number } | undefined;

    const items = db.prepare(`
      SELECT *, operator_id AS tenant_id FROM backups
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(operatorId, limit, offset) as unknown as BackupRecord[];

    return {
      items,
      total: totalRow ? totalRow.count : 0
    };
  }

  /**
   * Soft-delete a backup record by setting its deleted_at timestamp.
   *
   * @param id - Backup identifier.
   * @returns True if deleted, false if not found.
   */
  public static softDelete(id: string): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE backups
      SET deleted_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(Date.now(), id, operatorId);

    return (result as { changes: number }).changes > 0;
  }

  /**
   * Retrieve backups exceeding retention policy threshold for deletion.
   *
   * @param retentionDays - Days before current timestamp to mark as expired.
   * @returns Array of expired backup records.
   */
  public static getOldBackups(retentionDays: number): BackupRecord[] {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const thresholdMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    return db.prepare(`
      SELECT *, operator_id AS tenant_id FROM backups
      WHERE operator_id = ? AND created_at < ? AND deleted_at IS NULL
    `).all(operatorId, thresholdMs) as unknown as BackupRecord[];
  }
}


