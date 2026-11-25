import { Request, Response } from 'express';
import fs from 'fs';
import prisma from '../../config/prisma';
import { getR2Storage } from '../../services/storage/r2-storage';
import { generateR2ObjectKey, normalizeStorageKey, StorageScope } from '../../services/storage/key-generator';
import { StorageRbacService, StorageUserContext, effectiveOrgId } from '../../services/storage/storage-rbac.service';
import {
  MAX_UPLOAD_BYTES,
  buildContentDisposition,
  isInlineSafeContentType,
  resolveFileType,
  storedContentDisposition,
} from '../../services/storage/file-policy';
import { normalizeRole } from '../../security/request-context';
import { sendSuccess, sendCreated, sendNoContent } from '../common/response';
import { ApiError } from '../common/errors';
import { parsePagination, buildPagination } from '../common/pagination';
import { logger } from '../../utils/logger';
import { storageScopeEnum } from './validators';

const STORED_FILE_SORT_FIELDS = ['createdAt', 'updatedAt', 'originalName', 'sizeBytes'] as const;

/** Scopes teachers may list across their organization (shared teaching material). */
const TEACHER_LISTABLE_SCOPES = ['courses', 'syllabus', 'assignments', 'blogs', 'documents'];

function getUserContext(req: Request): StorageUserContext {
  const user = req.user;
  if (!user || !user.id) {
    throw ApiError.unauthorized('Authentication required');
  }
  const role = normalizeRole(user.role);
  const orgId = role === 'SUPER_ADMIN'
    ? user.activeOrganizationId || user.organizationId
    : user.organizationId || user.activeOrganizationId;
  return {
    id: user.id,
    role,
    organizationId: effectiveOrgId(orgId),
    email: user.email ?? null,
  };
}

async function assertCanUpload(user: StorageUserContext, scope: string, entityId: string): Promise<void> {
  if (!StorageRbacService.canUploadToScope(user, scope, entityId)) {
    throw ApiError.forbidden(`You do not have permission to upload files to ${scope}`);
  }
  if (!(await StorageRbacService.canUploadToEntity(user, scope, entityId))) {
    throw ApiError.forbidden(`You do not have permission to upload files to ${scope}`);
  }
}

function removeTempFile(tempPath: string | undefined): void {
  if (tempPath && fs.existsSync(tempPath)) {
    try {
      fs.unlinkSync(tempPath);
    } catch (err) {
      logger.warn(`[storage] Could not remove temp upload: ${err}`);
    }
  }
}

/** Signed URL options that force a download for anything not safe to render inline. */
function downloadUrlOptions(originalName: string, mimeType: string) {
  const resolved = resolveFileType(originalName);
  const inline = Boolean(resolved?.inline) && isInlineSafeContentType(mimeType);
  if (inline) return {};
  return {
    responseContentType: resolved?.contentType ?? 'application/octet-stream',
    responseContentDisposition: buildContentDisposition(originalName, false),
  };
}

/**
 * POST /api/v1/storage/presign-upload
 * Generates presigned URL for direct browser-to-R2 upload
 */
export async function presignUpload(req: Request, res: Response): Promise<void> {
  const user = getUserContext(req);
  const { filename, sizeBytes, scope, entityId, subFolder, isPublic } = req.body;

  const fileType = resolveFileType(filename);
  if (!fileType) {
    throw ApiError.badRequest('This file type is not allowed');
  }
  if (typeof sizeBytes !== 'number' || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    throw ApiError.badRequest('File size is not allowed');
  }
  if (isPublic && !StorageRbacService.canMarkPublic(user)) {
    throw ApiError.forbidden('Only staff can publish files to the organization');
  }

  // 1. RBAC authorization for scope and target entity
  await assertCanUpload(user, scope, entityId);

  // 2. Generate deterministic R2 key
  const { key, fileId } = generateR2ObjectKey({
    scope: scope as StorageScope,
    entityId,
    filename,
    subFolder,
  });

  const contentDisposition = storedContentDisposition(filename, fileType);
  const r2 = getR2Storage();
  const expiresInSeconds = 900; // 15 minutes
  const uploadUrl = await r2.getPresignedUploadUrl(key, fileType.contentType, expiresInSeconds, {
    contentLength: sizeBytes,
    contentDisposition,
  });

  // Pre-create metadata record
  await prisma.storedFile.upsert({
    where: { key },
    create: {
      id: fileId,
      key,
      bucket: process.env.R2_BUCKET_NAME || 'vidyaai-uploads',
      originalName: filename,
      mimeType: fileType.contentType,
      sizeBytes,
      scope,
      ownerId: user.id,
      organizationId: user.organizationId ?? null,
      entityId,
      isPublic: Boolean(isPublic),
    },
    update: {
      originalName: filename,
      mimeType: fileType.contentType,
      sizeBytes,
    },
  });

  sendCreated(res, {
    uploadUrl,
    fileId,
    key,
    expiresInSeconds,
    requiredHeaders: {
      'Content-Type': fileType.contentType,
      'Content-Length': String(sizeBytes),
      ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
    },
  });
}

/**
 * POST /api/v1/storage/upload
 * Handles direct multipart file upload via server and saves to Cloudflare R2
 */
export async function directUpload(req: Request, res: Response): Promise<void> {
  const user = getUserContext(req);
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }

  const { originalname, size, path: tempPath } = req.file;

  try {
    const parsedScope = storageScopeEnum.safeParse(req.body.scope || 'documents');
    if (!parsedScope.success) {
      throw ApiError.badRequest('Invalid storage scope');
    }
    const scope = parsedScope.data as StorageScope;
    const rawEntityId = req.body.entityId ?? user.id;
    if (typeof rawEntityId !== 'string' || rawEntityId.length === 0 || rawEntityId.length > 100) {
      throw ApiError.badRequest('Invalid entityId');
    }
    const entityId = rawEntityId;
    const isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;

    const fileType = resolveFileType(originalname);
    if (!fileType) {
      throw ApiError.badRequest('This file type is not allowed');
    }
    if (size > MAX_UPLOAD_BYTES) {
      throw ApiError.badRequest('File size is not allowed');
    }
    if (isPublic && !StorageRbacService.canMarkPublic(user)) {
      throw ApiError.forbidden('Only staff can publish files to the organization');
    }

    // 1. RBAC Check
    await assertCanUpload(user, scope, entityId);

    // 2. Generate R2 key
    const { key, fileId } = generateR2ObjectKey({
      scope,
      entityId,
      filename: originalname,
    });

    let buffer: Buffer;
    if (tempPath && fs.existsSync(tempPath)) {
      buffer = fs.readFileSync(tempPath);
    } else if (req.file.buffer) {
      buffer = req.file.buffer;
    } else {
      throw ApiError.badRequest('Failed to read uploaded file');
    }

    // 3. Upload to Cloudflare R2 with a server-derived Content-Type
    const r2 = getR2Storage();
    try {
      await r2.save(key, buffer, fileType.contentType, {
        contentDisposition: storedContentDisposition(originalname, fileType),
      });
    } catch (r2Err: any) {
      logger.error(`[directUpload] R2 upload failed for key=${key}: ${r2Err.message}`);
      throw ApiError.internal('Failed to upload file to storage');
    }

    // 4. Save metadata to DB (with rollback if DB fails)
    let record;
    try {
      record = await prisma.storedFile.create({
        data: {
          id: fileId,
          key,
          bucket: process.env.R2_BUCKET_NAME || 'vidyaai-uploads',
          originalName: originalname,
          mimeType: fileType.contentType,
          sizeBytes: buffer.length,
          scope,
          ownerId: user.id,
          organizationId: user.organizationId ?? null,
          entityId,
          isPublic,
        },
      });
    } catch (dbErr: any) {
      logger.error(`[directUpload] DB record creation failed, rolling back R2 key=${key}: ${dbErr.message}`);
      await r2.delete(key).catch(() => {});
      throw ApiError.internal('Failed to save file metadata');
    }

    const downloadUrl = await r2.getSignedDownloadUrl(key, 900, downloadUrlOptions(originalname, fileType.contentType));

    sendCreated(res, {
      ...record,
      downloadUrl,
    });
  } finally {
    removeTempFile(tempPath);
  }
}

/**
 * GET /api/v1/storage/:id/access
 * Authenticated RBAC verification and presigned download URL generation
 */
export async function getFileAccess(req: Request, res: Response): Promise<void> {
  const user = getUserContext(req);
  const { id } = req.params;

  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) {
    throw ApiError.notFound('File not found');
  }

  const canAccess = await StorageRbacService.canAccessFile(user, 'file:read', file);
  if (!canAccess) {
    throw ApiError.forbidden('You do not have permission to access this file');
  }

  const r2 = getR2Storage();
  const expiresInSeconds = 900;
  const downloadUrl = await r2.getSignedDownloadUrl(file.key, expiresInSeconds, downloadUrlOptions(file.originalName, file.mimeType));

  sendSuccess(res, {
    data: {
      fileId: file.id,
      key: file.key,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      downloadUrl,
      expiresInSeconds,
    },
  });
}

/**
 * GET /api/v1/storage/by-key
 * Access a file by object key. Only keys with a StoredFile record are served,
 * so authorization is always evaluated against the record's real owner and
 * tenant.
 */
export async function getFileByKey(req: Request, res: Response): Promise<void> {
  const user = getUserContext(req);
  const rawKey = req.query.key;
  if (typeof rawKey !== 'string' || !rawKey) {
    throw ApiError.badRequest('Key query parameter is required');
  }

  let key: string;
  try {
    key = normalizeStorageKey(rawKey);
  } catch {
    throw ApiError.badRequest('Invalid key');
  }

  const file = await prisma.storedFile.findUnique({ where: { key } });
  if (!file) {
    throw ApiError.notFound('File not found');
  }

  const canAccess = await StorageRbacService.canAccessFile(user, 'file:read', file);
  if (!canAccess) {
    throw ApiError.forbidden('You do not have permission to access this file');
  }

  const r2 = getR2Storage();
  const expiresInSeconds = 900;
  const downloadUrl = await r2.getSignedDownloadUrl(file.key, expiresInSeconds, downloadUrlOptions(file.originalName, file.mimeType));

  sendSuccess(res, {
    data: {
      key: file.key,
      downloadUrl,
      expiresInSeconds,
    },
  });
}

/**
 * DELETE /api/v1/storage/:id
 * RBAC authorization, R2 object removal, and database metadata cleanup
 */
export async function deleteFile(req: Request, res: Response): Promise<void> {
  const user = getUserContext(req);
  const { id } = req.params;

  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) {
    throw ApiError.notFound('File not found');
  }

  const canDelete = await StorageRbacService.canAccessFile(user, 'file:delete', file);
  if (!canDelete) {
    throw ApiError.forbidden('You do not have permission to delete this file');
  }

  const r2 = getR2Storage();
  await r2.delete(file.key);
  await prisma.storedFile.delete({ where: { id } });

  sendNoContent(res);
}

/**
 * GET /api/v1/storage
 * List stored files, always confined to the caller's organization
 * (SUPER_ADMIN excepted). Students see their own files plus files published to
 * their organization; teachers additionally see shared teaching material.
 */
export async function listFiles(req: Request, res: Response): Promise<void> {
  const user = getUserContext(req);
  const { page, limit, sort, order } = parsePagination(req, STORED_FILE_SORT_FIELDS);
  const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
  const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : undefined;

  const where: any = {};
  if (scope) where.scope = scope;
  if (entityId) where.entityId = entityId;

  if (user.role !== 'SUPER_ADMIN') {
    if (!user.organizationId) {
      where.ownerId = user.id;
    } else if (user.role === 'ADMIN') {
      where.organizationId = user.organizationId;
    } else if (user.role === 'TEACHER') {
      where.organizationId = user.organizationId;
      where.OR = [
        { ownerId: user.id },
        { isPublic: true },
        { scope: { in: TEACHER_LISTABLE_SCOPES } },
      ];
    } else {
      where.organizationId = user.organizationId;
      where.OR = [
        { ownerId: user.id },
        { isPublic: true },
      ];
    }
  } else if (user.organizationId) {
    where.organizationId = user.organizationId;
  }

  const [files, total] = await Promise.all([
    prisma.storedFile.findMany({
      where,
      orderBy: { [sort]: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.storedFile.count({ where }),
  ]);

  sendSuccess(res, {
    data: files,
    pagination: buildPagination(page, limit, total),
  });
}
