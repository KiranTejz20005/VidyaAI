import path from 'path';
import { env } from '../config/env';

export class UnsafePathError extends Error {
  constructor(message = 'File path is outside the upload directory') {
    super(message);
    this.name = 'UnsafePathError';
  }
}

/** Absolute, normalized upload root that every stored file must live under. */
export function getUploadRoot(): string {
  return path.resolve(env.UPLOAD_DIR);
}

/**
 * Resolves a stored file reference (as written to the DB or a job payload) to
 * an absolute path confined to the upload root. Accepted forms:
 *   - "/uploads/<name>" or "uploads/<name>" (public URL style, relative to the root)
 *   - a path relative to the upload root
 *   - an absolute path that already lies inside the upload root (multer's file.path)
 * Anything that escapes the root (absolute elsewhere, "../" traversal, NUL bytes,
 * URLs) throws UnsafePathError.
 */
export function resolveUploadPath(filePath: string, root: string = getUploadRoot()): string {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new UnsafePathError('File path is empty');
  }
  if (filePath.includes('\0')) {
    throw new UnsafePathError('File path contains a NUL byte');
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(filePath)) {
    throw new UnsafePathError('Remote URLs are not local files');
  }

  const base = path.resolve(root);
  const trimmed = filePath.trim();
  const uploadsPrefix = /^[/\\]?uploads[/\\]/i;

  let resolved: string;
  if (uploadsPrefix.test(trimmed)) {
    resolved = path.resolve(base, trimmed.replace(uploadsPrefix, ''));
  } else if (path.isAbsolute(trimmed)) {
    resolved = path.resolve(trimmed);
  } else {
    resolved = path.resolve(base, trimmed);
  }

  if (!isWithin(base, resolved)) {
    throw new UnsafePathError();
  }
  return resolved;
}

function isWithin(base: string, candidate: string): boolean {
  if (process.platform === 'win32') {
    return candidate.toLowerCase().startsWith(base.toLowerCase() + path.sep);
  }
  return candidate.startsWith(base + path.sep);
}
