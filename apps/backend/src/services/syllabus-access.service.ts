import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  getRequestOrgId,
  getRequestUserId,
  isAdminRole,
  isSuperAdmin,
} from '../security/request-context';

/**
 * Syllabi a caller may read: their own, plus every syllabus of their tenant.
 * Only a SUPER_ADMIN without a selected organization sees all of them.
 */
export function syllabusReadWhere(req: Request): Prisma.SyllabusWhereInput {
  const userId = getRequestUserId(req);
  const orgId = getRequestOrgId(req);
  if (isSuperAdmin(req.user?.role) && !orgId) return {};
  return { OR: [{ userId }, ...(orgId ? [{ organizationId: orgId }] : [])] };
}

/**
 * Syllabi a caller may change: their own, or (for an organization admin) any
 * syllabus of their tenant. Teachers cannot edit colleagues' syllabi.
 */
export function syllabusWriteWhere(req: Request): Prisma.SyllabusWhereInput {
  const userId = getRequestUserId(req);
  const orgId = getRequestOrgId(req);
  if (isSuperAdmin(req.user?.role) && !orgId) return {};
  if (isAdminRole(req.user?.role) && orgId) {
    return { OR: [{ userId }, { organizationId: orgId }] };
  }
  return { userId };
}
