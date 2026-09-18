import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDatabase, closeDatabase } from '../../../database/client.js';
import { runMigrations } from '../../../database/migrator.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';
import {
  stripExifFromJpeg,
  stripMetadataFromPng,
  sanitizePdf,
  sanitizeMediaFile
} from '../backend/sanitizer.js';
import { AttachmentService } from '../backend/service.js';
import { AttachmentRepository } from '../backend/repository.js';
import { parseMultipartBuffer } from '../backend/multipart.js';

describe('Universal Attachments Subsystem Suite', () => {
  let db: any;
  const operatorA = generateUUIDv7();
  const operatorB = generateUUIDv7();
  const testUploadDir = path.resolve('./storage/test-uploads');

  before(() => {
    process.env['STORAGE_PATH'] = testUploadDir;
    db = getDatabase({ inMemory: true });
    runMigrations(db);

    const now = Date.now();
    // Operator A with small quota (50 KB: 51200 bytes)
    db.prepare(`
      INSERT INTO operators (id, name, storage_quota_bytes, created_at, updated_at)
      VALUES (?, 'Operator A', 51200, ?, ?)
    `).run(operatorA, now, now);

    // Operator B with standard quota (10 MB)
    db.prepare(`
      INSERT INTO operators (id, name, storage_quota_bytes, created_at, updated_at)
      VALUES (?, 'Operator B', 10485760, ?, ?)
    `).run(operatorB, now, now);
  });

  after(() => {
    closeDatabase();
    if (fs.existsSync(testUploadDir)) {
      try { fs.rmSync(testUploadDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('stripExifFromJpeg removes APP1 metadata segment while preserving image data', () => {
    // Construct JPEG with APP1 marker (0xFF, 0xE1) containing dummy EXIF
    const app1Data = Buffer.from('Exif\0\0GPSInfoAndCameraHardwareIdentifier');
    const app1Len = app1Data.length + 2;
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(app1Len);

    const fakeJpeg = Buffer.concat([
      Buffer.from([0xFF, 0xD8]), // SOI
      Buffer.from([0xFF, 0xE1]), // APP1 marker
      lenBuf,
      app1Data,
      Buffer.from([0xFF, 0xDA]), // SOS (Start of scan)
      Buffer.from('FakeImageDataPayload'),
      Buffer.from([0xFF, 0xD9])  // EOI
    ]);

    const result = stripExifFromJpeg(fakeJpeg);
    assert.equal(result.wasSanitized, true);
    assert.equal(result.buffer.includes(Buffer.from('GPSInfoAndCameraHardwareIdentifier')), false);
    assert.equal(result.buffer[0], 0xFF);
    assert.equal(result.buffer[1], 0xD8);
  });

  it('stripMetadataFromPng removes tEXt and eXIf metadata chunks', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const textChunkData = Buffer.from('Software\0GarrisonOS');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(textChunkData.length);
    const crcBuf = Buffer.alloc(4);

    const textChunk = Buffer.concat([
      lenBuf,
      Buffer.from('tEXt'),
      textChunkData,
      crcBuf
    ]);

    const iendChunk = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from('IEND'),
      Buffer.alloc(4)
    ]);

    const fakePng = Buffer.concat([pngHeader, textChunk, iendChunk]);
    const result = stripMetadataFromPng(fakePng);
    assert.equal(result.wasSanitized, true);
    assert.equal(result.buffer.includes(Buffer.from('Software\0GarrisonOS')), false);
  });

  it('sanitizePdf neutralizes /JavaScript and /Launch executable triggers', () => {
    const maliciousPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert("pwned")) >> /Launch (calc.exe) >>\nendobj\n%%EOF'
    );

    const result = sanitizePdf(maliciousPdf);
    assert.equal(result.wasSanitized, true);
    const sanitizedText = result.buffer.toString('utf8');
    assert.equal(sanitizedText.includes('/JavaScript'), false);
    assert.equal(sanitizedText.includes('/Launch'), false);
    assert.match(sanitizedText, /%PDF-1.4/);
  });

  it('sanitizeMediaFile enforces format whitelisting and rejects dangerous extensions', () => {
    const fakeExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
    assert.throws(() => {
      sanitizeMediaFile(fakeExe, 'malware.exe');
    }, /strictly prohibited/);

    assert.throws(() => {
      sanitizeMediaFile(Buffer.from('<?php echo "leak"; ?>'), 'shell.php');
    }, /strictly prohibited/);

    // Mismatched magic bytes (text payload labeled as .jpg)
    assert.throws(() => {
      sanitizeMediaFile(Buffer.from('not a jpeg'), 'photo.jpg');
    }, /File signature verification failed/);
  });

  it('parseMultipartBuffer parses boundary-delimited fields and files accurately', () => {
    const boundary = '---------------------------1234567890';
    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="entity_type"\r\n\r\n` +
      `lease\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="entity_id"\r\n\r\n` +
      `lease-uuid-123\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="sample.txt"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `Simple text document content.\r\n` +
      `--${boundary}--\r\n`
    );

    const parsed = parseMultipartBuffer(multipartBody, boundary);
    assert.equal(parsed.fields['entity_type'], 'lease');
    assert.equal(parsed.fields['entity_id'], 'lease-uuid-123');
    assert.equal(parsed.files.length, 1);
    assert.equal(parsed.files[0]!.filename, 'sample.txt');
    assert.equal(parsed.files[0]!.buffer.toString('utf8'), 'Simple text document content.');
  });

  it('uploadAttachment persists sanitized file and records database metadata', async () => {
    const validTxt = Buffer.from('Lease agreement terms for unit 4B.');
    const attachment = await AttachmentService.uploadAttachment({
      operatorId: operatorA,
      entityType: 'lease',
      entityId: 'lease-test-1',
      filename: 'contract.txt',
      buffer: validTxt
    });

    assert.equal(attachment.operator_id, operatorA);
    assert.equal(attachment.entity_type, 'lease');
    assert.equal(attachment.entity_id, 'lease-test-1');
    assert.equal(attachment.file_name, 'contract.txt');
    assert.equal(attachment.file_size_bytes, validTxt.length);
    assert.equal(attachment.mime_type, 'text/plain');

    // Verify file exists on disk
    const retrieved = AttachmentService.getAttachment(attachment.id, operatorA);
    assert.equal(fs.existsSync(retrieved.fullPath), true);
    assert.equal(fs.readFileSync(retrieved.fullPath, 'utf8'), 'Lease agreement terms for unit 4B.');
  });

  it('uploadAttachment enforces operator storage quota and rejects exceeding uploads with QUOTA_EXCEEDED', async () => {
    // Operator A has 50 KB quota. Attempt to upload a 60 KB payload.
    const largeBuffer = Buffer.alloc(60 * 1024, 0x41); // 60 KB of 'A' characters
    let threw = false;

    try {
      await AttachmentService.uploadAttachment({
        operatorId: operatorA,
        entityType: 'property',
        entityId: 'prop-large-1',
        filename: 'large-data.txt',
        buffer: largeBuffer
      });
    } catch (err: any) {
      threw = true;
      assert.equal(err.code, 'QUOTA_EXCEEDED');
      assert.match(err.message, /quota exceeded/i);
    }

    assert.equal(threw, true);
  });

  it('Attachment isolation: Operator B cannot access Operator A attachments', async () => {
    const txt = Buffer.from('Sensitive landlord insurance certificate.');
    const attachment = await AttachmentService.uploadAttachment({
      operatorId: operatorA,
      entityType: 'property',
      entityId: 'prop-isolated-1',
      filename: 'insurance.txt',
      buffer: txt
    });

    // Operator B query must fail with NOT_FOUND
    assert.throws(() => {
      AttachmentService.getAttachment(attachment.id, operatorB);
    }, (err: any) => err.code === 'NOT_FOUND');

    const listB = AttachmentRepository.listByEntity(operatorB);
    assert.equal(listB.some((a) => a.id === attachment.id), false);
  });

  it('deleteAttachment soft-deletes record and hides it from query listings', async () => {
    const txt = Buffer.from('Work order receipt invoice.');
    const attachment = await AttachmentService.uploadAttachment({
      operatorId: operatorB,
      entityType: 'work_order',
      entityId: 'wo-delete-test',
      filename: 'receipt.txt',
      buffer: txt
    });

    const deleted = AttachmentService.deleteAttachment(attachment.id, operatorB);
    assert.equal(deleted, true);

    // Should not be found after soft deletion
    assert.throws(() => {
      AttachmentService.getAttachment(attachment.id, operatorB);
    }, (err: any) => err.code === 'NOT_FOUND');
  });
});
