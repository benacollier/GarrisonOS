import { IncomingMessage } from 'node:http';

/**
 * Parsed file item from a multipart/form-data payload.
 */
export interface MultipartFile {
  /** Name of the form field. */
  fieldName: string;
  /** Original client-submitted filename. */
  filename: string;
  /** Declared content-type header of the file part. */
  contentType: string;
  /** Extracted file byte buffer. */
  buffer: Buffer;
}

/**
 * Complete result of parsing a multipart/form-data payload.
 */
export interface MultipartResult {
  /** Map of standard text form fields. */
  fields: Record<string, string>;
  /** List of uploaded files. */
  files: MultipartFile[];
}

/**
 * Extract boundary delimiter string from the HTTP Content-Type header.
 *
 * @param contentType - Raw Content-Type header value.
 * @returns Boundary string or null if not found.
 */
export function extractBoundary(contentType: string | undefined): string | null {
  if (!contentType) return null;
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return null;
  return (match[1] || match[2] || '').trim();
}

/**
 * Parse a raw multipart buffer into fields and files using native Node.js buffer operations.
 *
 * @param buffer - Complete HTTP request body buffer.
 * @param boundary - Extracted boundary string.
 * @returns Parsed MultipartResult.
 */
export function parseMultipartBuffer(buffer: Buffer, boundary: string): MultipartResult {
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];

  const delimiter = Buffer.from(`--${boundary}`);
  let start = 0;

  while (start < buffer.length) {
    const nextDelim = buffer.indexOf(delimiter, start);
    if (nextDelim === -1) break;

    const partStart = nextDelim + delimiter.length;
    if (partStart >= buffer.length) break;

    // Check if closing boundary '--'
    if (buffer[partStart] === 0x2D && buffer[partStart + 1] === 0x2D) {
      break;
    }

    // Skip \r\n after boundary
    let headersStart = partStart;
    if (buffer[headersStart] === 0x0D && buffer[headersStart + 1] === 0x0A) {
      headersStart += 2;
    }

    // Find end of headers (\r\n\r\n)
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headersStart);
    if (headerEnd === -1) break;

    const headerStr = buffer.toString('utf8', headersStart, headerEnd);
    const bodyStart = headerEnd + 4;

    // Find next boundary
    const bodyEnd = buffer.indexOf(delimiter, bodyStart);
    if (bodyEnd === -1) break;

    // Strip trailing \r\n before delimiter
    let realBodyEnd = bodyEnd;
    if (realBodyEnd >= 2 && buffer[realBodyEnd - 2] === 0x0D && buffer[realBodyEnd - 1] === 0x0A) {
      realBodyEnd -= 2;
    }

    const partData = buffer.subarray(bodyStart, realBodyEnd);

    // Parse Content-Disposition header
    const dispositionMatch = headerStr.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    if (dispositionMatch) {
      const name = dispositionMatch[1]!;
      const filename = dispositionMatch[2];

      if (filename !== undefined && filename !== '') {
        // File part
        const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n;]+)/i);
        const contentType = typeMatch ? typeMatch[1]!.trim() : 'application/octet-stream';

        files.push({
          fieldName: name,
          filename,
          contentType,
          buffer: partData
        });
      } else {
        // Text field part
        fields[name] = partData.toString('utf8');
      }
    }

    start = bodyEnd;
  }

  return { fields, files };
}

/**
 * Streamingly reads the full HTTP request body into memory and parses multipart/form-data.
 *
 * @param req - Incoming HTTP message.
 * @param maxSizeBytes - Maximum permitted upload size limit (default 25 MB).
 * @returns Promise resolving to MultipartResult.
 */
export async function readMultipartRequest(
  req: IncomingMessage,
  maxSizeBytes: number = 25 * 1024 * 1024
): Promise<MultipartResult> {
  const boundary = extractBoundary(req.headers['content-type']);
  if (!boundary) {
    throw new Error('Missing or invalid multipart/form-data boundary delimiter');
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > maxSizeBytes) {
      throw new Error(`Upload payload exceeds maximum limit of ${maxSizeBytes} bytes`);
    }
    chunks.push(buf);
  }

  const fullBuffer = Buffer.concat(chunks);
  return parseMultipartBuffer(fullBuffer, boundary);
}
