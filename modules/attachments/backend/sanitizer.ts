import * as path from 'node:path';

/**
 * Result of a file sanitization and validation routine.
 */
export interface SanitizationResult {
  /** Cleaned or validated file buffer. */
  buffer: Buffer;
  /** Verified and canonical MIME content type. */
  mimeType: string;
  /** Whether EXIF stripping, script neutralization, or modifications were applied. */
  isSanitized: boolean;
  /** Safe alphanumeric filename with valid extension. */
  sanitizedFilename: string;
}

/**
 * Allowed file extension mapping to canonical MIME types.
 */
const MIME_WHITELIST: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv'
};

/**
 * Disallowed dangerous extensions that are unconditionally rejected.
 */
const BANNED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.bin', '.ps1', '.vbs',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
  '.js', '.mjs', '.cjs', '.ts', '.html', '.htm', '.xhtml',
  '.svg', '.xml', '.jar', '.scr', '.dll', '.com', '.msi'
]);

/**
 * Strips EXIF metadata segments (APP1..APP15, COM) from JPEG image buffers.
 * Preserves JFIF header (APP0), quantization tables (DQT), Huffman tables (DHT),
 * frame markers (SOF), and scan data (SOS).
 *
 * @param buffer - Raw JPEG image buffer.
 * @returns Cleaned buffer and sanitization flag.
 */
export function stripExifFromJpeg(buffer: Buffer): { buffer: Buffer; wasSanitized: boolean } {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return { buffer, wasSanitized: false };
  }

  const pieces: Buffer[] = [Buffer.from([0xFF, 0xD8])];
  let offset = 2;
  let wasSanitized = false;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) {
      break;
    }

    // Skip consecutive 0xFF fill bytes
    while (offset < buffer.length && buffer[offset] === 0xFF) {
      offset++;
    }
    if (offset >= buffer.length) break;

    const marker = buffer[offset]!;
    offset++;

    // End of image
    if (marker === 0xD9) {
      pieces.push(Buffer.from([0xFF, 0xD9]));
      break;
    }

    // Start of scan (entropy-coded image data follows immediately until EOI)
    if (marker === 0xDA) {
      pieces.push(buffer.subarray(offset - 2));
      break;
    }

    // Standalone markers without payload
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      pieces.push(Buffer.from([0xFF, marker]));
      continue;
    }

    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);

    // APP1 (EXIF / GPS) is 0xE1; APP2..APP15 are 0xE2..0xEF; COM is 0xFE
    const isExifOrMetadata = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE;

    if (isExifOrMetadata) {
      wasSanitized = true;
    } else {
      // Keep segment
      pieces.push(buffer.subarray(offset - 2, offset + segmentLength));
    }

    offset += segmentLength;
  }

  return {
    buffer: wasSanitized ? Buffer.concat(pieces) : buffer,
    wasSanitized
  };
}

/**
 * Strips textual and EXIF metadata chunks (eXIf, tEXt, zTXt, iTXt) from PNG image buffers.
 *
 * @param buffer - Raw PNG image buffer.
 * @returns Cleaned buffer and sanitization flag.
 */
export function stripMetadataFromPng(buffer: Buffer): { buffer: Buffer; wasSanitized: boolean } {
  // PNG 8-byte signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
    return { buffer, wasSanitized: false };
  }

  const pieces: Buffer[] = [pngSignature];
  let offset = 8;
  let wasSanitized = false;

  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const totalChunkBytes = 12 + chunkLength; // 4 len + 4 type + data + 4 crc

    if (offset + totalChunkBytes > buffer.length) {
      break;
    }

    // Metadata chunks to strip
    if (chunkType === 'eXIf' || chunkType === 'tEXt' || chunkType === 'zTXt' || chunkType === 'iTXt') {
      wasSanitized = true;
    } else {
      pieces.push(buffer.subarray(offset, offset + totalChunkBytes));
    }

    offset += totalChunkBytes;

    if (chunkType === 'IEND') {
      break;
    }
  }

  return {
    buffer: wasSanitized ? Buffer.concat(pieces) : buffer,
    wasSanitized
  };
}

/**
 * Validates PDF byte stream structure and neutralizes interactive executable script triggers.
 *
 * @param buffer - Raw PDF document buffer.
 * @returns Cleaned buffer and sanitization flag.
 * @throws Error if PDF header is missing or malformed.
 */
export function sanitizePdf(buffer: Buffer): { buffer: Buffer; wasSanitized: boolean } {
  // Validate PDF magic bytes: '%PDF-' (0x25 0x50 0x44 0x46 0x2D)
  if (buffer.length < 5 || buffer.toString('ascii', 0, 5) !== '%PDF-') {
    throw new Error('Invalid PDF format: file lacks %PDF- header');
  }

  const pdfText = buffer.toString('binary');
  const dangerousTriggers = [
    { pattern: /\/JavaScript\b/g, replacement: '/DisabledJS' },
    { pattern: /\/JS\b/g, replacement: '/No' },
    { pattern: /\/Launch\b/g, replacement: '/NoLaunch' },
    { pattern: /\/EmbeddedFiles\b/g, replacement: '/DisabledEmbed' }
  ];

  let modifiedText = pdfText;
  let wasSanitized = false;

  for (const trigger of dangerousTriggers) {
    if (trigger.pattern.test(modifiedText)) {
      modifiedText = modifiedText.replace(trigger.pattern, trigger.replacement);
      wasSanitized = true;
    }
  }

  return {
    buffer: wasSanitized ? Buffer.from(modifiedText, 'binary') : buffer,
    wasSanitized
  };
}

/**
 * Validates magic signature bytes against declared file extensions to prevent polyglot attacks.
 *
 * @param buffer - File content buffer.
 * @param ext - File extension in lower case with leading dot (e.g. '.jpg').
 * @returns True if signatures match.
 */
function verifyMagicBytes(buffer: Buffer, ext: string): boolean {
  if (buffer.length === 0) return false;

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      // JPEG SOI: 0xFF 0xD8 0xFF
      return buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

    case '.png':
      // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4E &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0D &&
        buffer[5] === 0x0A &&
        buffer[6] === 0x1A &&
        buffer[7] === 0x0A
      );

    case '.pdf':
      return buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';

    case '.txt':
    case '.csv':
      // Check for zero-byte null characters indicating disguised binary payloads
      for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
        if (buffer[i] === 0x00) return false;
      }
      return true;

    default:
      return false;
  }
}

/**
 * Cleans a filename to eliminate path traversal, non-ASCII, and control characters.
 *
 * @param rawFilename - Untrusted client-provided filename.
 * @returns Sanitized basename.
 */
export function sanitizeFilename(rawFilename: string): string {
  const base = path.basename(rawFilename).trim();
  // Remove control characters and quotes
  const cleaned = base.replace(/[\x00-\x1F\x7F"'`\\/<>:|?*]/g, '_');
  return cleaned || 'attachment.bin';
}

/**
 * Comprehensive document and media hygiene pipeline:
 * 1. Checks extension against banned list.
 * 2. Checks extension against whitelist.
 * 3. Validates file magic bytes to defeat polyglots.
 * 4. Strips EXIF metadata from images.
 * 5. Sanitizes interactive executable triggers from PDFs.
 *
 * @param buffer - Incoming raw file buffer.
 * @param filename - Original filename string.
 * @returns SanitizationResult with cleaned buffer, canonical MIME, and clean filename.
 */
export function sanitizeMediaFile(buffer: Buffer, filename: string): SanitizationResult {
  const cleanName = sanitizeFilename(filename);
  const ext = path.extname(cleanName).toLowerCase();

  if (BANNED_EXTENSIONS.has(ext)) {
    throw new Error(`File upload rejected: extension '${ext}' is strictly prohibited`);
  }

  const mimeType = MIME_WHITELIST[ext];
  if (!mimeType) {
    throw new Error(`Unsupported file format: extension '${ext}' is not permitted`);
  }

  if (!verifyMagicBytes(buffer, ext)) {
    throw new Error(`File signature verification failed: magic bytes do not match declared format '${ext}'`);
  }

  let finalBuffer = buffer;
  let isSanitized = false;

  if (ext === '.jpg' || ext === '.jpeg') {
    const result = stripExifFromJpeg(buffer);
    finalBuffer = result.buffer;
    isSanitized = result.wasSanitized;
  } else if (ext === '.png') {
    const result = stripMetadataFromPng(buffer);
    finalBuffer = result.buffer;
    isSanitized = result.wasSanitized;
  } else if (ext === '.pdf') {
    const result = sanitizePdf(buffer);
    finalBuffer = result.buffer;
    isSanitized = result.wasSanitized;
  }

  return {
    buffer: finalBuffer,
    mimeType,
    isSanitized,
    sanitizedFilename: cleanName
  };
}
