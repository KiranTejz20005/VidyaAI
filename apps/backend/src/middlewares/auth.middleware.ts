import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.service';
import { logger } from '../utils/logger';

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

/**
 * Sentinel organization for accounts without one. It never matches a real
 * tenant, so `where: { organizationId }` filters stay restrictive instead of
 * collapsing to `undefined` (which Prisma treats as "no filter").
 */
export const NO_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

/** Endpoints usable while a temporary password is still in force. */
const PASSWORD_RESET_ALLOWED_PATHS = ['/auth/me', '/auth/me/password', '/auth/logout', '/auth/refresh'];

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
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
  }

  try {
    const decodedPayload = verifyAccessToken(token);
    req.user = {
      id: decodedPayload.userId,
      email: decodedPayload.email,
      role: decodedPayload.role,
      organizationId: decodedPayload.organizationId || NO_ORGANIZATION_ID,
      activeOrganizationId: decodedPayload.activeOrganizationId,
      departmentId: decodedPayload.departmentId,
    };
    if (decodedPayload.forcePasswordReset) {
      const path = req.originalUrl.split('?')[0];
      if (!PASSWORD_RESET_ALLOWED_PATHS.some((p) => path.endsWith(p))) {
        return res.status(403).json({
          success: false,
          error: 'You must set a new password before continuing',
          code: 'PASSWORD_RESET_REQUIRED',
        });
      }
    }
    return next();
  } catch (err) {
    const expired = err instanceof Error && err.message === 'Access token has expired';
    return res.status(401).json({
      success: false,
      error: expired ? 'Access token has expired' : 'Invalid authentication credentials',
      code: expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
    });
  }
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

    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
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
    let role = req.user.role.toUpperCase();
    if (role === 'ORG_ADMIN') role = 'ADMIN';
    if (role === 'FACULTY') role = 'TEACHER';

    if (role === 'SUPER_ADMIN') {
      return next();
    }

    const normalizedAllowedRoles = allowedRoles.map(r => {
      let norm = r.toUpperCase();
      if (norm === 'ORG_ADMIN') norm = 'ADMIN';
      if (norm === 'FACULTY') norm = 'TEACHER';
      return norm;
    });

    if (normalizedAllowedRoles.includes(role)) {
      return next();
    }

    logger.warn({ userId: req.user.id, role: req.user.role, allowedRoles: normalizedAllowedRoles, url: req.originalUrl }, '[Authorize] Insufficient privileges');
    return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges', code: 'FORBIDDEN' });
  };
};
