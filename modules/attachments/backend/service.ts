import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { generateUUIDv7 } from '../../../core/crypto.js';
import { sanitizeMediaFile } from './sanitizer.js';
import { AttachmentRecord, AttachmentRepository } from './repository.js';

/**
 * Valid operational entity categories for document attachment associations.
 */
export const ALLOWED_ENTITY_TYPES = new Set([
  'lease',
  'property',
  'unit',
  'contact',
  'work_order',
  'bill'
]);

/**
 * Upload request parameter bundle.
 */
export interface UploadAttachmentParams {
  /** Operator isolation identifier. */
  operatorId: string;
  /** Target entity domain type. */
  entityType: string;
  /** Identifier of the target operational entity. */
  entityId: string;
  /** Original client filename. */
  filename: string;
  /** Raw un-sanitized file buffer. */
  buffer: Buffer;
}

/**
 * Core business service managing document uploads, media safety sanitization,
 * operator storage quota enforcement, and secure file streaming.
 */
export class AttachmentService {
  /**
   * Resolves the root upload storage directory, creating it recursively if needed.
   *
   * @returns Absolute path to storage uploads directory.
   */
  public static getUploadStorageDir(): string {
    const configuredPath = process.env['STORAGE_PATH'] || './storage/uploads';
    const uploadDir = path.resolve(configuredPath);
    fs.mkdirSync(uploadDir, { recursive: true });
    return uploadDir;
  }

  /**
   * Resolves a relative file path safely inside the uploads directory,
   * defending against path traversal attacks.
   *
   * @param relativePath - Relative path string.
   * @returns Absolute verified path.
   * @throws Error if the resolved path escapes the uploads root.
   */
  public static resolveSafeStoragePath(relativePath: string): string {
    const uploadDir = this.getUploadStorageDir();
    const resolved = path.resolve(uploadDir, relativePath);
    const normalizedUploadDir = path.normalize(uploadDir) + path.sep;

    if (!resolved.startsWith(normalizedUploadDir) && resolved !== uploadDir) {
      throw new Error(`Directory traversal attempt rejected: ${relativePath}`);
    }

    return resolved;
  }

  /**
   * Ingests, validates, sanitizes, and persists a file attachment.
   * Enforces operator storage quotas, strips EXIF markers and PDF script triggers,
   * and saves the file outside the web root.
   *
   * @param params - Upload parameters.
   * @returns Created and verified AttachmentRecord.
   * @throws Error with code 'QUOTA_EXCEEDED' if operator storage limit is reached.
   */
  public static async uploadAttachment(params: UploadAttachmentParams): Promise<AttachmentRecord> {
    const { operatorId, entityType, entityId, filename, buffer } = params;

    // 1. Validate entity type and identifier
    if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
      const err: any = new Error(`Invalid entity_type '${entityType}'. Allowed: ${Array.from(ALLOWED_ENTITY_TYPES).join(', ')}`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!entityId || typeof entityId !== 'string' || entityId.trim().length === 0) {
      const err: any = new Error('entity_id must be a non-empty string identifier');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // 2. Enforce operator storage quotas
    const currentUsage = AttachmentRepository.getTotalStorageUsed(operatorId);
    const quota = AttachmentRepository.getOperatorStorageQuota(operatorId);

    if (currentUsage + buffer.length > quota) {
      const err: any = new Error(
        `Operator storage quota exceeded. Current: ${currentUsage} bytes, Upload: ${buffer.length} bytes, Quota: ${quota} bytes`
      );
      err.code = 'QUOTA_EXCEEDED';
      throw err;
    }

    // 3. Document & media safety sanitization (EXIF stripping, PDF executable neutralization)
    const sanitized = sanitizeMediaFile(buffer, filename);

    // 4. Cryptographic SHA-256 digest
    const checksum = crypto.createHash('sha256').update(sanitized.buffer).digest('hex');

    // 5. Unique attachment ID & safe filesystem storage path
    const attachmentId = generateUUIDv7();
    const targetDir = path.join(this.getUploadStorageDir(), operatorId, entityType);
    fs.mkdirSync(targetDir, { recursive: true });

    const diskFilename = `${attachmentId}-${sanitized.sanitizedFilename}`;
    const fullPath = path.join(targetDir, diskFilename);
    const relativeStoragePath = path.join(operatorId, entityType, diskFilename);

    fs.writeFileSync(fullPath, sanitized.buffer);

    // 6. Record metadata in database
    return AttachmentRepository.create({
      id: attachmentId,
      operator_id: operatorId,
      entity_type: entityType,
      entity_id: entityId,
      file_name: sanitized.sanitizedFilename,
      file_size_bytes: sanitized.buffer.length,
      mime_type: sanitized.mimeType,
      storage_path: relativeStoragePath,
      checksum_sha256: checksum,
      is_sanitized: sanitized.isSanitized ? 1 : 0,
      created_at: Date.now()
    });
  }

  /**
   * Retrieves an attachment record and resolves its verified physical storage path.
   *
   * @param id - Attachment UUID.
   * @param operatorId - Operator isolation boundary.
   * @returns Object containing AttachmentRecord and verified absolute file path.
   */
  public static getAttachment(id: string, operatorId: string): { record: AttachmentRecord; fullPath: string } {
    const record = AttachmentRepository.getById(id, operatorId);
    if (!record) {
      const err: any = new Error(`Attachment not found: ${id}`);
      err.code = 'NOT_FOUND';
      throw err;
    }

    const fullPath = this.resolveSafeStoragePath(record.storage_path);
    if (!fs.existsSync(fullPath)) {
      const err: any = new Error(`Physical attachment file missing on disk`);
      err.code = 'FILE_MISSING';
      throw err;
    }

    return { record, fullPath };
  }

  /**
   * Deletes an attachment by unlinking its physical file from disk and
   * soft-deleting the corresponding database record to prevent disk exhaustion.
   *
   * @param id - Attachment UUID.
   * @param operatorId - Operator isolation boundary.
   * @returns True if soft deleted, false if not found.
   */
  public static deleteAttachment(id: string, operatorId: string): boolean {
    const record = AttachmentRepository.getById(id, operatorId);
    if (!record) {
      return false;
    }

    try {
      const fullPath = this.resolveSafeStoragePath(record.storage_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      // Proceed to soft-delete even if physical file was already missing
    }

    return AttachmentRepository.softDelete(id, operatorId);
  }
}

/**
 * Canonical helper resolving the shared root filesystem directory for document attachments.
 *
 * @returns Absolute normalized path to storage root.
 */
export function getSharedAttachmentStorageDir(): string {
  return AttachmentService.getUploadStorageDir();
}
