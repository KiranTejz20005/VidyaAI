import path from 'path';
import fs from 'fs/promises';
import { env } from '../../config/env';
import type { StorageAdapter } from './storage-adapter';
import { normalizeStorageKey } from './key-generator';

export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;

  constructor(subDir = '') {
    this.baseDir = path.resolve(env.UPLOAD_DIR, subDir);
  }

  /**
   * Maps an object key to a file under baseDir, keeping the full key so keys
   * from different tenants/scopes never collide. Absolute paths, drive letters
   * and traversal segments are rejected, and the resolved path must stay
   * strictly inside baseDir.
   */
  private fullPath(key: string): string {
    if (typeof key !== 'string' || path.isAbsolute(key) || /^[a-zA-Z]:/.test(key)) {
      throw new Error('Invalid storage key');
    }
    const cleanKey = normalizeStorageKey(key);
    const base = path.resolve(this.baseDir);
    const resolved = path.resolve(base, ...cleanKey.split('/'));
    if (!resolved.startsWith(base + path.sep)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }

  async save(key: string, data: Buffer | Uint8Array, _contentType: string): Promise<string> {
    const fp = this.fullPath(key);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, data);
    return this.getPublicUrl(key);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.fullPath(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    let fp: string;
    try {
      fp = this.fullPath(key);
    } catch {
      return;
    }
    try {
      await fs.unlink(fp);
    } catch {
      // Already removed.
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(key));
      return true;
    } catch {
      return false;
    }
  }

  getPublicUrl(key: string): string {
    return `/api/papers/download/${path.basename(key)}`;
  }
}
