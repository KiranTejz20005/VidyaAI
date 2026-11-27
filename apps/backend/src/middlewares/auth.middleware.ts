import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.service';
import { logger } from '../utils/logger';
import prisma from '../config/prisma';
import { normalizeRole, NO_ORGANIZATION_ID } from '../security/request-context';

export { NO_ORGANIZATION_ID };
import { isActiveUserStatus } from '../security/account-status';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        organizationId?: string | null;
        activeOrganizationId?: string | null;
        departmentId?: string | null;
      };
      /**
       * Server-side authorization decisions made by middleware. Lives on the
       * request object (not req.body) so clients can never forge it.
       */
      authScope?: {
        requireOwnership?: boolean;
        organizationId?: string;
      };
    }
  }
}


/** Endpoints usable while a temporary password is still in force. */
const PASSWORD_RESET_ALLOWED_PATHS = new Set([
  '/api/v1/auth/me',
  '/api/v1/auth/me/password',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
  '/api/v1/admin/users/self/reset-password-force',
]);

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim() || undefined;
  }
  const cookieToken = req.cookies?.access_token;
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : undefined;
}

/**
 * Validates the access token from the Authorization header or the
 * `access_token` cookie. Tokens are deliberately not accepted from the query
 * string: URLs end up in access logs, browser history and Referer headers.
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
  }

  let decodedPayload: ReturnType<typeof verifyAccessToken>;
  try {
    decodedPayload = verifyAccessToken(token);
  } catch (err) {
    const expired = err instanceof Error && err.message === 'Access token has expired';
    return res.status(401).json({
      success: false,
      error: expired ? 'Access token has expired' : 'Invalid authentication credentials',
      code: expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
    });
  }

  // The JWT is only proof of a past login: re-check the account so deactivated
  // or deleted users lose access immediately and role/org changes apply at once.
  let dbUser: {
    id: string;
    role: string;
    status: string;
    organizationId: string | null;
    forcePasswordReset: boolean;
  } | null;
  try {
    dbUser = await prisma.user.findUnique({
      where: { id: decodedPayload.userId },
      select: { id: true, role: true, status: true, organizationId: true, forcePasswordReset: true },
    });
  } catch (err) {
    logger.error({ err }, '[Authenticate] User status lookup failed');
    return res.status(503).json({ success: false, error: 'Unable to verify account', code: 'AUTH_UNAVAILABLE' });
  }
  if (!dbUser || !isActiveUserStatus(dbUser.status)) {
    return res.status(401).json({ success: false, error: 'Account is inactive', code: 'UNAUTHORIZED' });
  }

  const dbOrgId = dbUser.organizationId || NO_ORGANIZATION_ID;
  const isSuper = normalizeRole(dbUser.role) === 'SUPER_ADMIN';
  // Only a SUPER_ADMIN may act on an organization other than their own (their
  // token's selection is kept). Everyone else is pinned to the DB organization;
  // /auth/me/switch-organization only lets non-super users pick their own org,
  // so a differing token claim is stale or forged and is ignored.
  const activeOrganizationId = isSuper
    ? (decodedPayload.activeOrganizationId ?? undefined)
    : (dbUser.organizationId ?? undefined);
  req.user = {
    id: decodedPayload.userId,
    email: decodedPayload.email,
    role: dbUser.role,
    organizationId: dbOrgId,
    activeOrganizationId,
    departmentId: decodedPayload.departmentId,
  };
  // DB is source of truth: clearing forcePasswordReset must unblock immediately
  // even if an older access token still carries the `pwr` claim.
  if (dbUser.forcePasswordReset) {
    const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
    if (!PASSWORD_RESET_ALLOWED_PATHS.has(path)) {
      return res.status(403).json({
        success: false,
        error: 'You must set a new password before continuing',
        code: 'PASSWORD_RESET_REQUIRED',
      });
    }
  }
  return next();
};

/**
 * Removes underscore-prefixed control keys from the JSON body. Older code
 * passed authorization flags through req.body; stripping them guarantees a
 * client can never inject such a flag.
 */
export const stripReservedBodyKeys = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    for (const key of Object.keys(req.body)) {
      if (key.startsWith('_require')) delete req.body[key];
    }
  }
  next();
};

/**
 * Marks the request so controllers restrict non-admin callers to resources
 * they own. Admins are not marked.
 */
export const requireOwnership = (_resourceType: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    const ownerRole = normalizeRole(req.user.role);
    if (ownerRole === 'SUPER_ADMIN' || ownerRole === 'ADMIN') {
      return next();
    }

    req.authScope = { ...req.authScope, requireOwnership: true };
    return next();
  };
};

/**
 * Enforces that the caller belongs to an organization and records the tenant
 * on req.authScope for controllers to filter by.
 */
export const requireOrganizationScope = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    if (req.user.role === 'SUPER_ADMIN') {
      const selected = req.user.activeOrganizationId || undefined;
      if (selected) req.authScope = { ...req.authScope, organizationId: selected };
      return next();
    }

    const orgId = req.user.activeOrganizationId || req.user.organizationId;
    if (!orgId || orgId === NO_ORGANIZATION_ID) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'User does not belong to an organization' });
    }

    req.authScope = { ...req.authScope, organizationId: orgId };
    return next();
  };
};

/**
 * Middleware to enforce strict role-based access control (RBAC).
 * Allows access if the user's role is in the allowedRoles array or if they are a SUPER_ADMIN.
 */
export const authorize = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const role = normalizeRole(req.user.role);

    if (role === 'SUPER_ADMIN') {
      return next();
    }

    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    if (normalizedAllowedRoles.includes(role)) {
      return next();
    }

    logger.warn({ userId: req.user.id, role: req.user.role, allowedRoles: normalizedAllowedRoles, url: req.originalUrl }, '[Authorize] Insufficient privileges');
    return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges', code: 'FORBIDDEN' });
  };
};
