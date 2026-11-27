import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const COOKIE_NAME = 'XSRF-TOKEN';
const HEADER_NAME = 'x-csrf-token';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Reserved for future signed provider webhooks (no handlers ship today).
 * Used by csrfProtection in app.ts. Do not add unsigned webhook routes.
 * Phase 3 plan: document footgun; user asked to implement Phase 3.
 */
function isWebhookPath(req: Request): boolean {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return /^\/api(\/v\d+)?\/webhooks?(\/|$)/.test(path);
}

/**
 * Pure Bearer-token requests carry no ambient credentials: a cross-site
 * attacker cannot set the Authorization header, so CSRF does not apply.
 * Skipped whenever the access_token cookie is present (cookie auth in play).
 */
function isPureBearerRequest(req: Request): boolean {
  const auth = req.headers.authorization;
  return (
    typeof auth === 'string' &&
    auth.startsWith('Bearer ') &&
    auth.length > 7 &&
    !req.cookies?.access_token
  );
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!SAFE_METHODS.includes(req.method) && (isWebhookPath(req) || isPureBearerRequest(req))) {
    next();
    return;
  }
  const cookieToken = req.cookies?.[COOKIE_NAME];

  if (SAFE_METHODS.includes(req.method)) {
    if (!cookieToken) {
      const token = generateToken();
      let cookieDomain: string | undefined = undefined;
      if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
        try {
          const frontendUrl = new URL(process.env.FRONTEND_URL.split(',')[0]);
          const hostname = frontendUrl.hostname.replace(/^www\./, '');
          cookieDomain = (hostname.includes('.') && !hostname.startsWith('localhost')) ? '.' + hostname : undefined;
        } catch(e) {
          // Ignore invalid URL
        }
      }

      res.cookie(COOKIE_NAME, token, {
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        domain: cookieDomain,
      });
    }
    next();
    return;
  }

  if (!cookieToken) {
    logger.warn({ ip: req.ip, method: req.method, path: req.path }, '[CSRF] Missing token cookie');
    res.status(403).json({ success: false, error: 'CSRF token missing' });
    return;
  }

  const headerToken = req.headers[HEADER_NAME] as string;
  if (!headerToken) {
    logger.warn({ ip: req.ip, method: req.method, path: req.path }, '[CSRF] Token mismatch');
    res.status(403).json({ success: false, error: 'CSRF token mismatch' });
    return;
  }

  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);
  if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    logger.warn({ ip: req.ip, method: req.method, path: req.path }, '[CSRF] Token mismatch');
    res.status(403).json({ success: false, error: 'CSRF token mismatch' });
    return;
  }

  next();
}
