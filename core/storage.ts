import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { generateUUIDv7 } from './crypto.js';

export interface StorageDriver {
  save(relativePath: string, buffer: Buffer, mimeType?: string): Promise<string>;
  read(relativePath: string): Promise<Buffer>;
  delete(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  generatePath(originalFilename: string): string;
}

export class LocalDiskStorageDriver implements StorageDriver {
  private baseDir: string;

  constructor(baseDir: string = process.env['STORAGE_PATH'] || './storage/uploads') {
    this.baseDir = path.resolve(baseDir);
  }

  private resolveSafePath(relativePath: string): string {
    const sanitized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.resolve(this.baseDir, sanitized);
    if (!absolutePath.startsWith(this.baseDir)) {
      throw new Error(`Path traversal attempt detected: ${relativePath}`);
    }
    return absolutePath;
  }

  public generatePath(originalFilename: string): string {
    const now = new Date();
    const year = now.getUTCFullYear().toString();
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const uuid = generateUUIDv7();
    const ext = path.extname(originalFilename).toLowerCase();
    const safeBase = path.basename(originalFilename, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    const fileName = safeBase ? `${uuid}_${safeBase}${ext}` : `${uuid}${ext}`;
    return path.join(year, month, fileName).replace(/\\/g, '/');
  }

  public async save(relativePath: string, buffer: Buffer): Promise<string> {
    const targetPath = this.resolveSafePath(relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
    return relativePath.replace(/\\/g, '/');
  }

  public async read(relativePath: string): Promise<Buffer> {
    const targetPath = this.resolveSafePath(relativePath);
    return await fs.readFile(targetPath);
  }

  public async delete(relativePath: string): Promise<void> {
    const targetPath = this.resolveSafePath(relativePath);
    try {
      await fs.unlink(targetPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  public async exists(relativePath: string): Promise<boolean> {
    const targetPath = this.resolveSafePath(relativePath);
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

let defaultStorageDriver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (!defaultStorageDriver) {
    defaultStorageDriver = new LocalDiskStorageDriver();
  }
  return defaultStorageDriver;
}

export function setStorageDriver(driver: StorageDriver): void {
  defaultStorageDriver = driver;
}

