import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

/**
 * File entry specification for tar archive packaging.
 */
export interface TarEntry {
  /** Relative path inside the tar archive (e.g. 'database.sqlite' or 'attachments/op1/photo.jpg'). */
  name: string;
  /** File content buffer. */
  data: Buffer;
  /** Unix file permission mode (default 0o644). */
  mode?: number;
  /** Modification timestamp in epoch milliseconds. */
  mtimeMs?: number;
}

/**
 * Extracted file record from a parsed tar archive.
 */
export interface ExtractedTarEntry {
  /** Relative file name inside the archive. */
  name: string;
  /** Extracted file contents buffer. */
  data: Buffer;
}

/**
 * Creates a standard POSIX ustar 512-byte tar header block.
 *
 * @param name - Relative file path inside the archive.
 * @param size - File size in bytes.
 * @param mode - Octal permission mode.
 * @param mtimeMs - Modification time in epoch milliseconds.
 * @returns 512-byte Buffer.
 */
export function createTarHeader(
  name: string,
  size: number,
  mode: number = 0o644,
  mtimeMs: number = Date.now()
): Buffer {
  const header = Buffer.alloc(512, 0);

  // 1. File name: bytes 0-99
  const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8');
  if (nameBuf.length > 100) {
    // Truncate if exceeds 100 bytes in basic ustar
    nameBuf.copy(header, 0, 0, 100);
  } else {
    nameBuf.copy(header, 0);
  }

  // 2. Mode: bytes 100-107 (8 bytes octal)
  header.write(`${(mode & 0o7777).toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');

  // 3. UID: bytes 108-115 (8 bytes octal)
  header.write(`${(0).toString(8).padStart(7, '0')}\0`, 108, 8, 'ascii');

  // 4. GID: bytes 116-123 (8 bytes octal)
  header.write(`${(0).toString(8).padStart(7, '0')}\0`, 116, 8, 'ascii');

  // 5. Size: bytes 124-135 (12 bytes octal)
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');

  // 6. Mtime: bytes 136-147 (12 bytes octal in seconds)
  const mtimeSeconds = Math.floor(mtimeMs / 1000);
  header.write(`${mtimeSeconds.toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');

  // 7. Checksum placeholder: bytes 148-155 (8 spaces during computation)
  header.fill(0x20, 148, 156);

  // 8. Type flag: byte 156 ('0' for regular file)
  header[156] = 0x30; // '0'

  // 9. Magic and version: bytes 257-264 ("ustar\0", "00")
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');

  // 10. Uname & Gname: bytes 265-328
  header.write('garrison\0', 265, 9, 'ascii');
  header.write('garrison\0', 297, 9, 'ascii');

  // Compute checksum across 512 bytes with spaces in checksum field
  let checksum = 0;
  for (let i = 0; i < 512; i++) {
    checksum += header[i]!;
  }

  // Write computed checksum: 6 octal digits + null + space
  const checksumStr = `${checksum.toString(8).padStart(6, '0')}\0 `;
  header.write(checksumStr, 148, 8, 'ascii');

  return header;
}

/**
 * Packages an array of TarEntry objects into an uncompressed POSIX tar Buffer.
 *
 * @param entries - List of files to pack into the archive.
 * @returns Complete tar buffer.
 */
export function packTar(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    const header = createTarHeader(entry.name, entry.data.length, entry.mode, entry.mtimeMs);
    chunks.push(header);
    chunks.push(entry.data);

    // 512-byte padding
    const remainder = entry.data.length % 512;
    if (remainder > 0) {
      const padSize = 512 - remainder;
      chunks.push(Buffer.alloc(padSize, 0));
    }
  }

  // End of archive: two 512-byte blocks of zeroes
  chunks.push(Buffer.alloc(1024, 0));

  return Buffer.concat(chunks);
}

/**
 * Unpacks an uncompressed POSIX tar buffer into extracted file records.
 * Validates path traversal defense to ensure extracted paths do not escape target roots.
 *
 * @param tarBuffer - Tar archive byte buffer.
 * @returns Array of extracted file records.
 */
export function unpackTar(tarBuffer: Buffer): ExtractedTarEntry[] {
  const entries: ExtractedTarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);

    // Check for two consecutive empty blocks signaling EOF
    let isEmpty = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        isEmpty = false;
        break;
      }
    }

    if (isEmpty) {
      break;
    }

    // Extract file name
    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) {
      nameEnd++;
    }
    const name = header.toString('utf8', 0, nameEnd).trim();

    // Extract size
    const sizeStr = header.toString('ascii', 124, 135).replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8);

    if (Number.isNaN(size) || size < 0) {
      break;
    }

    // Extract type flag (byte 156)
    const typeFlag = header[156];
    offset += 512;

    if (typeFlag === 0x30 || typeFlag === 0x00) {
      // Regular file
      if (offset + size > tarBuffer.length) {
        throw new Error(`Corrupted tar archive: truncated file entry for ${name}`);
      }

      const fileData = tarBuffer.subarray(offset, offset + size);
      entries.push({
        name,
        data: Buffer.from(fileData)
      });
    }

    // Advance offset past file data and 512-byte padding
    const remainder = size % 512;
    const padding = remainder > 0 ? 512 - remainder : 0;
    offset += size + padding;
  }

  return entries;
}

/**
 * Packs multiple files or directories into a compressed .tar.gz archive file on disk.
 *
 * @param targetGzPath - Destination .tar.gz file path.
 * @param entries - List of TarEntry items to package.
 */
export async function createTarGzFile(targetGzPath: string, entries: TarEntry[]): Promise<void> {
  const tarBuf = packTar(entries);
  const compressed = zlib.gzipSync(tarBuf, { level: 9 });
  fs.mkdirSync(path.dirname(targetGzPath), { recursive: true });
  fs.writeFileSync(targetGzPath, compressed);
}

/**
 * Extracts a .tar.gz archive file into memory or a destination directory.
 *
 * @param sourceGzPath - Path to .tar.gz file.
 * @param destDir - Optional destination directory to write extracted files.
 * @returns Array of extracted file records.
 */
export async function extractTarGzFile(
  sourceGzPath: string,
  destDir?: string
): Promise<ExtractedTarEntry[]> {
  const compressed = fs.readFileSync(sourceGzPath);
  const tarBuf = zlib.gunzipSync(compressed);
  const entries = unpackTar(tarBuf);

  if (destDir) {
    const normalizedDest = path.normalize(path.resolve(destDir)) + path.sep;

    for (const entry of entries) {
      const targetPath = path.resolve(destDir, entry.name);
      if (!targetPath.startsWith(normalizedDest)) {
        throw new Error(`Directory traversal blocked in archive: ${entry.name}`);
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, entry.data);
    }
  }

  return entries;
}
