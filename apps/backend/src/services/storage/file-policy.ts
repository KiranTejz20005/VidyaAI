import path from 'path';

/**
 * Upload/serving policy for user-supplied files.
 *
 * The stored Content-Type is always derived from the validated extension, never
 * from the client-declared MIME type. Only formats a browser renders without
 * executing script (raster images, PDF, audio, video) may be served inline;
 * everything else is forced to download. SVG and HTML are not accepted at all
 * because they execute script when opened from the storage origin.
 */
const EXTENSION_CONTENT_TYPES: Readonly<Record<string, string>> = {
  // Documents
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.rtf': 'application/rtf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.epub': 'application/epub+zip',
  // Images (no SVG)
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
};

/** Hard ceiling for any single stored object (matches the presign validator). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export interface ResolvedFileType {
  extension: string;
  contentType: string;
  /** True when the browser may render the file inline from the storage origin. */
  inline: boolean;
}

export function isInlineSafeContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct === 'application/pdf' ||
    (ct.startsWith('image/') && !ct.includes('svg')) ||
    ct.startsWith('audio/') ||
    ct.startsWith('video/')
  );
}

/** Returns the allowlisted type for `filename`, or null when the extension is not accepted. */
export function resolveFileType(filename: string): ResolvedFileType | null {
  const extension = path.extname(path.basename(filename || '')).toLowerCase();
  const contentType = EXTENSION_CONTENT_TYPES[extension];
  if (!contentType) return null;
  return { extension, contentType, inline: isInlineSafeContentType(contentType) };
}

/** RFC 6266 Content-Disposition value with an ASCII fallback and a UTF-8 filename*. */
export function buildContentDisposition(filename: string, inline: boolean): string {
  const base = path.basename(filename || 'file');
  const ascii = base.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file';
  const encoded = encodeURIComponent(base).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Content-Disposition to store on an object, or undefined when inline rendering is safe. */
export function storedContentDisposition(filename: string, type: ResolvedFileType): string | undefined {
  return type.inline ? undefined : buildContentDisposition(filename, false);
}
