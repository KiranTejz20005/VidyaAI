import type { Request } from 'express';
import { ForbiddenError } from '../../api/common/errors';
import { getRequestOrgId, getRequestUserId, isSuperAdmin } from '../../security/request-context';

/**
 * The authenticated principal performing an administrative action. Built only
 * from the verified access token, never from the request body.
 */
export interface AdminActor {
  id: string;
  role: string;
  isSuperAdmin: boolean;
  /** Caller tenant. Undefined only for a SUPER_ADMIN without a selected organization. */
  organizationId?: string;
}

/** Caller tenant from the token, treating the "no organization" sentinel as absent. */
export function callerOrgId(req: Request): string | undefined {
  return getRequestOrgId(req);
}

export function requireCallerOrgId(req: Request): string {
  const orgId = callerOrgId(req);
  if (!orgId) throw new ForbiddenError('Organization scope required', 'ORG_SCOPE_REQUIRED');
  return orgId;
}

export function actorFromRequest(req: Request): AdminActor {
  const id = getRequestUserId(req);
  const role = req.user?.role ?? '';
  const superAdmin = isSuperAdmin(role);
  return {
    id,
    role,
    isSuperAdmin: superAdmin,
    organizationId: superAdmin ? callerOrgId(req) : requireCallerOrgId(req),
  };
}

export function requireSuperAdmin(req: Request): void {
  if (!isSuperAdmin(req.user?.role)) {
    throw new ForbiddenError('Only a SUPER_ADMIN can perform this action');
  }
}

/** Upper bound for list endpoints that are not paginated by the client. */
export const ADMIN_LIST_DEFAULT_LIMIT = 50;
export const ADMIN_LIST_MAX_LIMIT = 100;

/** `skip`/`take` from `?page=&limit=` with a hard cap, for list endpoints. */
export function listWindow(req: Request): { skip: number; take: number } {
  const take = Math.min(ADMIN_LIST_MAX_LIMIT, Math.max(1, Math.floor(Number(req.query.limit)) || ADMIN_LIST_DEFAULT_LIMIT));
  const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
  return { skip: (page - 1) * take, take };
}
