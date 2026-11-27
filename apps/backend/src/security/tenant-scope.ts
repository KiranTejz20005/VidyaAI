import type { Request } from 'express';
import { ForbiddenError } from '../api/common/errors';
import { getRequestOrgId, realOrgId, isSuperAdmin } from './request-context';

/**
 * Prisma `where` fragment confining a query to the caller's tenant.
 *
 * - Everyone except a SUPER_ADMIN is pinned to exactly one real organization;
 *   an account without one is rejected (403) instead of matching every row.
 * - A SUPER_ADMIN is platform-wide unless they selected an organization.
 *
 * The tenant comes only from the verified access token, never from the request.
 */
export function tenantScope(req: Request): { organizationId?: string } {
  if (isSuperAdmin(req.user?.role)) {
    const selected = realOrgId(req.user?.activeOrganizationId);
    return selected ? { organizationId: selected } : {};
  }
  const orgId = getRequestOrgId(req);
  if (!orgId) {
    throw new ForbiddenError('Organization scope required', 'ORG_SCOPE_REQUIRED');
  }
  return { organizationId: orgId };
}
