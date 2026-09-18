import * as fs from 'node:fs';
import { Router } from '../../../api/router.js';
import { successResponse, errorResponse } from '../../../api/response.js';
import { requirePermission } from '../../../api/middleware.js';
import { RequestContext } from '../../../core/context.js';
import { AttachmentService } from './service.js';
import { AttachmentRepository } from './repository.js';
import { readMultipartRequest } from './multipart.js';

/**
 * Register Universal Attachments REST API endpoints with the central router.
 *
 * @param router - Application API router instance.
 */
export function registerRoutes(router: Router): void {
  /**
   * Upload a new document attachment with automated media safety sanitization.
   * Expects multipart/form-data with 'file', 'entity_type', and 'entity_id'.
   */
  router.post('/api/v1/attachments', requirePermission('attachments:upload'), async (req, res) => {
    const operatorId = RequestContext.getOperatorId();

    try {
      const parsed = await readMultipartRequest(req);
      const entityType = parsed.fields['entity_type'];
      const entityId = parsed.fields['entity_id'];
      const file = parsed.files[0];

      if (!entityType || !entityId) {
        return errorResponse(res, 'VALIDATION_ERROR', 'Form fields "entity_type" and "entity_id" are required', 400);
      }

      if (!file || !file.buffer || file.buffer.length === 0) {
        return errorResponse(res, 'VALIDATION_ERROR', 'No file payload provided in upload request', 400);
      }

      const attachment = await AttachmentService.uploadAttachment({
        operatorId,
        entityType,
        entityId,
        filename: file.filename,
        buffer: file.buffer
      });

      successResponse(res, attachment, 201);
    } catch (err: any) {
      if (err?.code === 'QUOTA_EXCEEDED') {
        return errorResponse(res, 'QUOTA_EXCEEDED', err.message, 413);
      }
      if (err?.code === 'VALIDATION_ERROR') {
        return errorResponse(res, 'VALIDATION_ERROR', err.message, 400);
      }
      errorResponse(res, 'UPLOAD_ERROR', err.message || 'Failed to process attachment upload', 400);
    }
  });

  /**
   * List document attachments for the active operator, optionally filtered by entity.
   */
  router.get('/api/v1/attachments', requirePermission('attachments:view'), (_req, res) => {
    const operatorId = RequestContext.getOperatorId();
    const entityType = typeof _req.query['entity_type'] === 'string' ? _req.query['entity_type'] : undefined;
    const entityId = typeof _req.query['entity_id'] === 'string' ? _req.query['entity_id'] : undefined;

    const attachments = AttachmentRepository.listByEntity(operatorId, entityType, entityId);
    successResponse(res, { attachments });
  });

  /**
   * Retrieve metadata for a single attachment by ID.
   */
  router.get('/api/v1/attachments/:id', requirePermission('attachments:view'), (req, res) => {
    const operatorId = RequestContext.getOperatorId();
    const id = req.params['id'];

    if (!id) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Attachment ID is required', 400);
    }

    const attachment = AttachmentRepository.getById(id, operatorId);
    if (!attachment) {
      return errorResponse(res, 'NOT_FOUND', `Attachment '${id}' not found`, 404);
    }

    successResponse(res, attachment);
  });

  /**
   * Streamingly download physical file content with strict MIME and nosniff headers.
   */
  router.get('/api/v1/attachments/:id/download', requirePermission('attachments:view'), (req, res) => {
    const operatorId = RequestContext.getOperatorId();
    const id = req.params['id'];

    if (!id) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Attachment ID is required', 400);
    }

    try {
      const { record, fullPath } = AttachmentService.getAttachment(id, operatorId);

      const encodedFilename = encodeURIComponent(record.file_name).replace(/['()]/g, escape);
      res.setHeader('Content-Type', record.mime_type);
      res.setHeader('Content-Length', String(record.file_size_bytes));
      res.setHeader('Content-Disposition', `attachment; filename="${record.file_name}"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const stream = fs.createReadStream(fullPath);
      stream.on('error', (err) => {
        if (!res.headersSent) {
          errorResponse(res, 'STREAM_ERROR', `Error streaming attachment: ${err.message}`, 500);
        }
      });
      stream.pipe(res);
    } catch (err: any) {
      if (err?.code === 'NOT_FOUND') {
        return errorResponse(res, 'NOT_FOUND', err.message, 404);
      }
      errorResponse(res, 'DOWNLOAD_ERROR', err.message || 'Failed to download attachment', 500);
    }
  });

  /**
   * Soft-delete an attachment record.
   */
  router.delete('/api/v1/attachments/:id', requirePermission('attachments:delete'), (req, res) => {
    const operatorId = RequestContext.getOperatorId();
    const id = req.params['id'];

    if (!id) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Attachment ID is required', 400);
    }

    const deleted = AttachmentService.deleteAttachment(id, operatorId);
    if (!deleted) {
      return errorResponse(res, 'NOT_FOUND', `Attachment '${id}' not found`, 404);
    }

    successResponse(res, { message: 'Attachment deleted successfully' });
  });
}
