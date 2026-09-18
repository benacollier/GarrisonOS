import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../../../database/client.js';

/**
 * Universal document attachment record.
 */
export interface AttachmentRecord {
  /** Unique RFC 9562 UUIDv7 identifier. */
  id: string;
  /** Operator isolation identifier. */
  operator_id: string;
  /** Associated operational entity category ('lease', 'property', 'unit', 'contact', 'work_order', 'bill'). */
  entity_type: string;
  /** Identifier of the target operational entity. */
  entity_id: string;
  /** Sanitized human-readable file name with extension. */
  file_name: string;
  /** Physical file size in bytes. */
  file_size_bytes: number;
  /** Canonical MIME content type. */
  mime_type: string;
  /** Relative storage path on disk. */
  storage_path: string;
  /** Cryptographic SHA-256 hex digest. */
  checksum_sha256: string;
  /** Whether the file buffer was sanitized (EXIF stripped or scripts removed). */
  is_sanitized: number;
  /** UTC timestamp of creation in epoch milliseconds. */
  created_at: number;
  /** UTC timestamp of soft-deletion, or null if active. */
  deleted_at: number | null;
}

/**
 * Data access repository for attachments with multi-operator isolation.
 */
export class AttachmentRepository {
  /**
   * Inserts a new attachment record into the database.
   *
   * @param data - Attachment properties.
   * @param dbInstance - Optional DatabaseSync instance.
   * @returns Created AttachmentRecord.
   */
  public static create(
    data: Omit<AttachmentRecord, 'deleted_at'>,
    dbInstance?: DatabaseSync
  ): AttachmentRecord {
    const db = dbInstance || getDatabase();
    const stmt = db.prepare(`
      INSERT INTO attachments (
        id, operator_id, entity_type, entity_id, file_name,
        file_size_bytes, mime_type, storage_path, checksum_sha256,
        is_sanitized, created_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);

    stmt.run(
      data.id,
      data.operator_id,
      data.entity_type,
      data.entity_id,
      data.file_name,
      data.file_size_bytes,
      data.mime_type,
      data.storage_path,
      data.checksum_sha256,
      data.is_sanitized,
      data.created_at
    );

    return {
      ...data,
      deleted_at: null
    };
  }

  /**
   * Retrieves an attachment record by primary key, verifying operator isolation.
   *
   * @param id - Attachment identifier.
   * @param operatorId - Operator isolation boundary.
   * @param dbInstance - Optional DatabaseSync instance.
   * @returns AttachmentRecord or null if not found or deleted.
   */
  public static getById(
    id: string,
    operatorId: string,
    dbInstance?: DatabaseSync
  ): AttachmentRecord | null {
    const db = dbInstance || getDatabase();
    const row = db.prepare(`
      SELECT id, operator_id, entity_type, entity_id, file_name,
             file_size_bytes, mime_type, storage_path, checksum_sha256,
             is_sanitized, created_at, deleted_at
      FROM attachments
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).get(id, operatorId) as AttachmentRecord | undefined;

    return row || null;
  }

  /**
   * Lists active attachments belonging to an operator, optionally filtered by entity.
   *
   * @param operatorId - Operator isolation boundary.
   * @param entityType - Optional target entity type.
   * @param entityId - Optional target entity ID.
   * @param dbInstance - Optional DatabaseSync instance.
   * @returns Array of AttachmentRecord items.
   */
  public static listByEntity(
    operatorId: string,
    entityType?: string,
    entityId?: string,
    dbInstance?: DatabaseSync
  ): AttachmentRecord[] {
    const db = dbInstance || getDatabase();

    if (entityType && entityId) {
      return db.prepare(`
        SELECT id, operator_id, entity_type, entity_id, file_name,
               file_size_bytes, mime_type, storage_path, checksum_sha256,
               is_sanitized, created_at, deleted_at
        FROM attachments
        WHERE operator_id = ? AND entity_type = ? AND entity_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
      `).all(operatorId, entityType, entityId) as unknown as AttachmentRecord[];
    }

    if (entityType) {
      return db.prepare(`
        SELECT id, operator_id, entity_type, entity_id, file_name,
               file_size_bytes, mime_type, storage_path, checksum_sha256,
               is_sanitized, created_at, deleted_at
        FROM attachments
        WHERE operator_id = ? AND entity_type = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
      `).all(operatorId, entityType) as unknown as AttachmentRecord[];
    }

    return db.prepare(`
      SELECT id, operator_id, entity_type, entity_id, file_name,
             file_size_bytes, mime_type, storage_path, checksum_sha256,
             is_sanitized, created_at, deleted_at
      FROM attachments
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `).all(operatorId) as unknown as AttachmentRecord[];
  }

  /**
   * Soft-deletes an attachment record by setting deleted_at.
   *
   * @param id - Attachment identifier.
   * @param operatorId - Operator isolation boundary.
   * @param dbInstance - Optional DatabaseSync instance.
   * @returns True if a record was updated, false otherwise.
   */
  public static softDelete(
    id: string,
    operatorId: string,
    dbInstance?: DatabaseSync
  ): boolean {
    const db = dbInstance || getDatabase();
    const result = db.prepare(`
      UPDATE attachments
      SET deleted_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(Date.now(), id, operatorId);

    return Number(result.changes) > 0;
  }

  /**
   * Computes the total non-deleted file storage consumption in bytes for an operator.
   *
   * @param operatorId - Operator isolation boundary.
   * @param dbInstance - Optional DatabaseSync instance.
   * @returns Total bytes consumed.
   */
  public static getTotalStorageUsed(
    operatorId: string,
    dbInstance?: DatabaseSync
  ): number {
    const db = dbInstance || getDatabase();
    const row = db.prepare(`
      SELECT COALESCE(SUM(file_size_bytes), 0) as total_bytes
      FROM attachments
      WHERE operator_id = ? AND deleted_at IS NULL
    `).get(operatorId) as { total_bytes: number } | undefined;

    return Number(row?.total_bytes || 0);
  }

  /**
   * Retrieves the allocated storage quota in bytes for an operator.
   *
   * @param operatorId - Operator isolation boundary.
   * @param dbInstance - Optional DatabaseSync instance.
   * @returns Storage quota in bytes (defaults to 10 GB if unconfigured).
   */
  public static getOperatorStorageQuota(
    operatorId: string,
    dbInstance?: DatabaseSync
  ): number {
    const db = dbInstance || getDatabase();
    const row = db.prepare(`
      SELECT storage_quota_bytes
      FROM operators
      WHERE id = ? AND deleted_at IS NULL
    `).get(operatorId) as { storage_quota_bytes: number } | undefined;

    return Number(row?.storage_quota_bytes || 10737418240);
  }
}
