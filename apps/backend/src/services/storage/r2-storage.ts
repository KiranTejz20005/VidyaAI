import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import type { StorageAdapter } from './storage-adapter';
import { normalizeStorageKey } from './key-generator';

export interface R2PutOptions {
  /** Stored on the object and returned on every GET (e.g. `attachment; filename=...`). */
  contentDisposition?: string;
}

export interface R2PresignUploadOptions extends R2PutOptions {
  /** Exact byte length the client must upload; signed into the URL. */
  contentLength?: number;
}

export class R2StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private publicDomain?: string;

  constructor() {
    const accountId = env.R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID || '';
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY || '';
    this.bucket = env.R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || env.S3_BUCKET || 'vidyaai-uploads';
    this.publicDomain = env.R2_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN;

    // Cloudflare R2 endpoint format: https://<account_id>.r2.cloudflarestorage.com
    const endpoint = accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : process.env.R2_ENDPOINT_URL || undefined;

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Return public URL or direct download path if custom public domain is explicitly configured
   */
  getPublicUrl(key: string): string {
    if (this.publicDomain) {
      const cleanDomain = this.publicDomain.replace(/\/+$/, '');
      return `${cleanDomain}/${key}`;
    }
    return `/api/v1/storage/by-key?key=${encodeURIComponent(key)}`;
  }

  /**
   * Save a buffer directly to R2 and return the presigned download URL
   */
  async save(key: string, data: Buffer | Uint8Array, contentType: string, options: R2PutOptions = {}): Promise<string> {
    const cleanKey = normalizeStorageKey(key);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      Body: data,
      ContentType: contentType,
      ...(options.contentDisposition ? { ContentDisposition: options.contentDisposition } : {}),
    }));
    return this.getSignedDownloadUrl(cleanKey);
  }

  /**
   * Fetch an object by its exact key. Callers must pass the full key stored on
   * a DB record; bare filenames are not resolved against folder prefixes.
   */
  async get(key: string): Promise<Buffer | null> {
    let cleanKey: string;
    try {
      cleanKey = normalizeStorageKey(key);
    } catch {
      logger.warn('[R2Storage] Rejected invalid object key on get');
      return null;
    }

    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      }));
      if (!response.Body) return null;

      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch {
      logger.debug(`[R2Storage] Object not found in R2 for key=${cleanKey}`);
      return null;
    }
  }

  /**
   * Delete an object from R2
   */
  async delete(key: string): Promise<void> {
    const cleanKey = normalizeStorageKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      }));
      logger.info(`[R2Storage] Deleted key=${cleanKey} from bucket=${this.bucket}`);
    } catch (err) {
      logger.error(`[R2Storage] Delete error for key=${cleanKey}: ${err}`);
      throw err;
    }
  }

  /**
   * Check whether an object exists at exactly `key`
   */
  async exists(key: string): Promise<boolean> {
    let cleanKey: string;
    try {
      cleanKey = normalizeStorageKey(key);
    } catch {
      return false;
    }
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate pre-signed URL for direct browser uploading (default 15 minutes).
   * Content-Type, Content-Length and Content-Disposition are signed, so the
   * client must upload exactly the declared type and size.
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
    options: R2PresignUploadOptions = {},
  ): Promise<string> {
    const cleanKey = normalizeStorageKey(key);
    const isMock = !process.env.R2_ACCOUNT_ID && !env.R2_ACCESS_KEY_ID && !env.S3_ACCESS_KEY_ID;
    if (isMock) {
      return `/api/v1/storage/upload?key=${encodeURIComponent(cleanKey)}`;
    }
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      ContentType: contentType,
      ...(options.contentLength !== undefined ? { ContentLength: options.contentLength } : {}),
      ...(options.contentDisposition ? { ContentDisposition: options.contentDisposition } : {}),
    });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(['content-type', 'content-length', 'content-disposition']),
    });
  }

  /**
   * Generate temporary pre-signed URL for downloading/viewing (default 15 minutes)
   */
  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds = 900,
    options: { responseContentType?: string; responseContentDisposition?: string } = {},
  ): Promise<string> {
    const cleanKey = normalizeStorageKey(key);
    const isMock = !process.env.R2_ACCOUNT_ID && !env.R2_ACCESS_KEY_ID && !env.S3_ACCESS_KEY_ID;
    if (isMock) {
      return `/api/v1/storage/by-key?key=${encodeURIComponent(cleanKey)}`;
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      ...(options.responseContentType ? { ResponseContentType: options.responseContentType } : {}),
      ...(options.responseContentDisposition ? { ResponseContentDisposition: options.responseContentDisposition } : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}

let r2Instance: R2StorageAdapter | null = null;
export function getR2Storage(): R2StorageAdapter {
  if (!r2Instance) {
    r2Instance = new R2StorageAdapter();
  }
  return r2Instance;
}
