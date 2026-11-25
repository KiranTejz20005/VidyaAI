import type { Request } from 'express';
import { AuthError, ForbiddenError, NotFoundError } from '../api/common/errors';

export type SystemRole = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'FACULTY' | 'STUDENT';

/** Normalize role aliases used in JWT / frontend to permission keys. */
export function normalizeRole(role: string | undefined | null): string {
  if (!role) return '';
  const upper = role.toUpperCase();
  if (upper === 'FACULTY') return 'TEACHER';
  if (upper === 'ORG_ADMIN') return 'ADMIN';
  return upper;
}

export function getRequestUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new AuthError();
  return userId;
}

/**
 * Tenant the request acts on. Derived only from the verified access token —
 * never from the request body, query or headers. A SUPER_ADMIN acts on the
 * organization selected through /auth/me/switch-organization (if any).
 */
export function getRequestOrgId(req: Request): string | undefined {
  if (isSuperAdmin(req.user?.role)) {
    return req.user?.activeOrganizationId || req.user?.organizationId || undefined;
  }
  return req.user?.organizationId || req.user?.activeOrganizationId || undefined;
}

export function requireRequestOrgId(req: Request): string {
  const orgId = getRequestOrgId(req);
  if (!orgId) throw new ForbiddenError('Organization scope required', 'ORG_SCOPE_REQUIRED');
  return orgId;
}

/**
 * Prisma `where` fragment that confines a query to the caller's tenant.
 * A SUPER_ADMIN without a selected organization gets platform-wide scope;
 * every other caller is always constrained to exactly one organization.
 */
export function orgScope(req: Request): { organizationId?: string } {
  if (isSuperAdmin(req.user?.role) && !getRequestOrgId(req)) return {};
  return { organizationId: requireRequestOrgId(req) };
}

/**
 * Throws 404 unless the record belongs to the caller's tenant. Records with a
 * null organization are only reachable by a SUPER_ADMIN (fail closed). A 404
 * rather than 403 avoids confirming that an id exists in another tenant.
 */
export function assertSameOrg(req: Request, recordOrgId: string | null | undefined, entity = 'Resource'): void {
  if (isSuperAdmin(req.user?.role)) return;
  const orgId = getRequestOrgId(req);
  if (!orgId || !recordOrgId || recordOrgId !== orgId) {
    throw new NotFoundError(`${entity} not found`);
  }
}

/** Throws 404 when `record` is missing or belongs to another tenant; returns it narrowed otherwise. */
export function requireInOrg<T extends { organizationId?: string | null }>(
  req: Request,
  record: T | null | undefined,
  entity = 'Resource',
): T {
  if (!record) throw new NotFoundError(`${entity} not found`);
  assertSameOrg(req, record.organizationId, entity);
  return record;
}

export function isSuperAdmin(role: string | undefined | null): boolean {
  return normalizeRole(role) === 'SUPER_ADMIN';
}

export function isAdminRole(role: string | undefined | null): boolean {
  const r = normalizeRole(role);
  return r === 'SUPER_ADMIN' || r === 'ADMIN';
}

export function isFacultyRole(role: string | undefined | null): boolean {
  const r = normalizeRole(role);
  return r === 'TEACHER';
}

export function isStudentRole(role: string | undefined | null): boolean {
  return normalizeRole(role) === 'STUDENT';
}
