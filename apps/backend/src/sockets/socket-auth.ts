import type { Socket } from 'socket.io';
import prisma from '../config/prisma';
import { verifyAccessToken } from '../services/auth.service';
import { isActiveUserStatus } from '../security/account-status';
import { logger } from '../utils/logger';
import type { SocketUser } from '../types/socket.types';

const MAX_TOKEN_LENGTH = 4096;

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/**
 * Access token for a Socket.IO handshake: `auth.token` (sent by the client via
 * `io(url, { auth: { token } })`), else the httpOnly `access_token` cookie.
 * Query-string tokens are deliberately not accepted.
 */
export function extractSocketToken(socket: Pick<Socket, 'handshake'>): string | undefined {
  const authToken = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    const token = authToken.trim().replace(/^Bearer\s+/i, '');
    return token.length <= MAX_TOKEN_LENGTH ? token : undefined;
  }
  const cookieHeader = socket.handshake.headers?.cookie;
  const cookieToken = readCookie(Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader, 'access_token');
  if (cookieToken && cookieToken.length <= MAX_TOKEN_LENGTH) return cookieToken;
  return undefined;
}

/**
 * Verifies the handshake token and loads the live user record. Returns null
 * when the token is missing/invalid/expired or the account is not ACTIVE.
 */
export async function resolveSocketUser(socket: Pick<Socket, 'handshake'>): Promise<SocketUser | null> {
  const token = extractSocketToken(socket);
  if (!token) return null;

  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return null;
  }
  if (!payload?.userId) return null;

  // Called by createSocketAuthMiddleware (socket.server.ts). Sole socket identity loader.
  // Reads User.status + forcePasswordReset; user asked to fix PASSWORD_RESET_REQUIRED 403s.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, organizationId: true, status: true, forcePasswordReset: true },
  });
  if (!user || !isActiveUserStatus(user.status)) return null;
  // Match HTTP authenticate: blocked until forced password change completes.
  if (user.forcePasswordReset) return null;

  const role = String(user.role);
  // A SUPER_ADMIN acts on the organization selected in their token; everyone
  // else is pinned to the organization stored on their user record.
  const organizationId =
    role === 'SUPER_ADMIN'
      ? payload.activeOrganizationId || user.organizationId || null
      : user.organizationId || null;

  return { id: user.id, role, organizationId };
}

export class SocketAuthError extends Error {
  data: { code: string };
  constructor(message: string, code: string) {
    super(message);
    this.name = 'SocketAuthError';
    this.data = { code };
  }
}

/**
 * Socket.IO `io.use()` middleware. Rejects the connection unless a valid
 * access token for an ACTIVE user is presented, then pins the verified
 * identity on `socket.data.user`. Nothing the client emits later can change it.
 */
export function createSocketAuthMiddleware(options: {
  canAcceptConnection?: (userId: string) => boolean;
} = {}) {
  return async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
    try {
      const user = await resolveSocketUser(socket);
      if (!user) {
        next(new SocketAuthError('Unauthorized', 'UNAUTHORIZED'));
        return;
      }
      if (options.canAcceptConnection && !options.canAcceptConnection(user.id)) {
        next(new SocketAuthError('Too many concurrent connections', 'TOO_MANY_CONNECTIONS'));
        return;
      }
      socket.data.user = user;
      next();
    } catch (err) {
      logger.error({ err }, '[SOCKET] Handshake authentication failed');
      next(new SocketAuthError('Unauthorized', 'UNAUTHORIZED'));
    }
  };
}
