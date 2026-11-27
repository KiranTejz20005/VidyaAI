import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { hashOpaqueToken } from '../security/credentials';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const PASSWORD_RESET_EXPIRY_MINUTES = 30;
const JWT_ALGORITHM = 'HS256' as const;

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId?: string | null;
  activeOrganizationId?: string | null;
  departmentId?: string | null;
  /** True while the account must set a new password before using the API. */
  forcePasswordReset?: boolean;
}

/** Fields of a User row needed to mint an access token. */
export interface TokenSubject {
  id: string;
  email: string;
  role: string;
  organizationId?: string | null;
  activeOrganizationId?: string | null;
  departmentId?: string | null;
  forcePasswordReset?: boolean | null;
}

export class AuthError extends Error {
  constructor(public status: number, message: string, public code = 'UNAUTHORIZED') {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Argon2id hash of a random string, computed once. Used to spend the same
 * time on unknown accounts as on real ones so login latency doesn't reveal
 * which emails are registered.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = argon2.hash(crypto.randomBytes(16).toString('hex'));
  return dummyHashPromise;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    logger.error({ err }, '[verifyPassword] argon2 verification error');
    return false;
  }
}

/** Burns a password verification against a throwaway hash (timing equalisation). */
export async function verifyAgainstDummyHash(password: string): Promise<void> {
  try {
    await verifyPassword(password, await getDummyHash());
  } catch {
    // Timing equalisation only; the result is irrelevant.
  }
}

export function generateRandomToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(
    {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      activeOrganizationId: payload.activeOrganizationId,
      departmentId: payload.departmentId,
      ...(payload.forcePasswordReset ? { pwr: true } : {}),
    },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: JWT_ALGORITHM },
  );
}

/** Mints an access token from a user record (single source of the claim set). */
export function issueAccessTokenForUser(user: TokenSubject): string {
  return generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    activeOrganizationId: user.activeOrganizationId,
    departmentId: user.departmentId,
    forcePasswordReset: Boolean(user.forcePasswordReset),
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as jwt.JwtPayload;
    return {
      userId: decoded.id,
      email: decoded.email,
      role: decoded.role,
      organizationId: decoded.organizationId,
      activeOrganizationId: decoded.activeOrganizationId,
      departmentId: decoded.departmentId,
      forcePasswordReset: decoded.pwr === true,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError(401, 'Access token has expired', 'TOKEN_EXPIRED');
    }
    throw new AuthError(401, 'Invalid access token');
  }
}

function refreshExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return expiresAt;
}

/** Creates a refresh token, optionally bound to a login session. */
export async function createRefreshToken(userId: string, sessionId?: string | null): Promise<string> {
  const rawToken = generateRandomToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashOpaqueToken(rawToken),
      userId,
      sessionId: sessionId ?? null,
      expiresAt: refreshExpiry(),
    },
  });
  return rawToken;
}

/**
 * Starts a login session and returns its first refresh token. Revoking the
 * session (DELETE /auth/me/sessions/:id) invalidates every token in its chain.
 */
export async function startSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string },
): Promise<{ sessionId: string; refreshToken: string }> {
  const session = await prisma.session.create({
    data: {
      userId,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
      expiresAt: refreshExpiry(),
    },
  });
  const refreshToken = await createRefreshToken(userId, session.id);
  return { sessionId: session.id, refreshToken };
}

/** Revokes every refresh token and session of a user ("sign out everywhere"). */
export async function revokeAllUserSessions(userId: string, exceptSessionId?: string | null): Promise<void> {
  const tokenFilter = exceptSessionId ? { NOT: { sessionId: exceptSessionId } } : {};
  await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false, ...tokenFilter },
    data: { isRevoked: true },
  });
  await prisma.session.updateMany({
    where: { userId, isActive: true, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
    data: { isActive: false },
  });
}

/** Throws unless the account is ACTIVE and (for org members) its organization is ACTIVE. */
export async function assertUserCanAuthenticate(user: { status: string; organizationId: string | null; role: string }): Promise<void> {
  if (user.status !== 'ACTIVE') {
    throw new AuthError(403, 'Account is not active', 'ACCOUNT_INACTIVE');
  }
  if (user.organizationId && user.role !== 'SUPER_ADMIN') {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { status: true },
    });
    if (org && org.status !== 'ACTIVE') {
      throw new AuthError(403, 'Organization is not active', 'ORGANIZATION_INACTIVE');
    }
  }
}

/**
 * Rotates a refresh token. The old token is revoked with a compare-and-set
 * (`isRevoked: false` in the WHERE clause), so two concurrent requests with the
 * same token cannot both succeed. Presenting an already-revoked token is
 * treated as theft: the whole session chain is revoked.
 */
export async function rotateRefreshToken(rawToken: string): Promise<{ accessToken: string; newRefreshToken: string }> {
  const tokenHash = hashOpaqueToken(rawToken);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true, session: { select: { isActive: true } } },
  });

  if (!record) {
    throw new AuthError(401, 'Invalid refresh token');
  }

  if (record.isRevoked) {
    if (record.sessionId) {
      await prisma.refreshToken.updateMany({ where: { sessionId: record.sessionId }, data: { isRevoked: true } });
      await prisma.session.updateMany({ where: { id: record.sessionId }, data: { isActive: false } });
    } else {
      await revokeAllUserSessions(record.userId);
    }
    logger.warn({ userId: record.userId, sessionId: record.sessionId }, '[auth] Revoked refresh token presented; session chain revoked');
    throw new AuthError(401, 'Refresh token reuse detected. Please sign in again.', 'REFRESH_TOKEN_REUSED');
  }

  if (record.expiresAt < new Date() || (record.session && !record.session.isActive)) {
    throw new AuthError(401, 'Session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  await assertUserCanAuthenticate(record.user);

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: record.id, isRevoked: false },
    data: { isRevoked: true },
  });
  if (claimed.count !== 1) {
    throw new AuthError(401, 'Refresh token already used', 'REFRESH_TOKEN_REUSED');
  }

  const newRefreshToken = await createRefreshToken(record.userId, record.sessionId);
  return { accessToken: issueAccessTokenForUser(record.user), newRefreshToken };
}

/** Revokes the refresh token and its session (logout). */
export async function revokeSession(rawToken: string): Promise<void> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashOpaqueToken(rawToken) },
    select: { id: true, sessionId: true },
  });
  if (!record) return;
  if (record.sessionId) {
    await prisma.refreshToken.updateMany({ where: { sessionId: record.sessionId }, data: { isRevoked: true } });
    await prisma.session.updateMany({ where: { id: record.sessionId }, data: { isActive: false } });
  } else {
    await prisma.refreshToken.updateMany({ where: { id: record.id }, data: { isRevoked: true } });
  }
}

/** Resolves the session id bound to a raw refresh token, if any. */
export async function getSessionIdForRefreshToken(rawToken: string | undefined): Promise<string | null> {
  if (!rawToken) return null;
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashOpaqueToken(rawToken) },
    select: { sessionId: true },
  });
  return record?.sessionId ?? null;
}

/**
 * Creates a single-use password reset token for the account, if one exists
 * and is an active password account. Returns the raw token for delivery, or
 * null. Callers must respond identically either way (no account enumeration).
 */
export async function createPasswordResetToken(email: string): Promise<{ rawToken: string; userId: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true, passwordHash: true },
  });
  if (!user || user.status !== 'ACTIVE' || !user.passwordHash) return null;

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  const rawToken = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60_000),
    },
  });
  return { rawToken, userId: user.id };
}

/**
 * Consumes a reset token and sets the new password. The token row is deleted
 * with a compare-and-delete so it can only be used once; all sessions of the
 * account are revoked afterwards.
 */
export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<string> {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashOpaqueToken(rawToken) } });
  if (!record || record.expiresAt < new Date()) {
    throw new AuthError(400, 'This reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
  }
  const consumed = await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
  if (consumed.count !== 1) {
    throw new AuthError(400, 'This reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
  }

  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(newPassword), forcePasswordReset: false },
  });
  await revokeAllUserSessions(record.userId);
  return record.userId;
}

/** Purges expired refresh, reset and session rows (retention housekeeping). */
export async function pruneExpiredAuthArtifacts(): Promise<void> {
  const now = new Date();
  const revokedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { isRevoked: true, createdAt: { lt: revokedCutoff } }] },
  });
  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Personal workspace provisioning
// ─────────────────────────────────────────────────────────────────────────────

function personalOrganizationFor(userId: string, email: string, firstName?: string | null) {
  const label = (firstName || email.split('@')[0] || 'My').trim();
  return {
    name: `${label}'s Workspace`.slice(0, 120),
    code: `P${userId.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
    email,
  };
}

type UserCreateData = Omit<Prisma.UserUncheckedCreateInput, 'id' | 'organizationId' | 'activeOrganizationId'>;

/**
 * Creates a self-service user together with an isolated personal workspace in one
 * transaction, so a user can never be left without a tenant (or a tenant without
 * its owner) if either insert fails. The workspace is never shared with anyone.
 */
export async function createUserWithPersonalOrganization(data: UserCreateData) {
  const userId = crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: personalOrganizationFor(userId, data.email, data.firstName) });
    return tx.user.create({
      data: { ...data, id: userId, organizationId: org.id, activeOrganizationId: org.id },
    });
  });
}

/**
 * Provisions a personal workspace for an existing org-less, non-super-admin user.
 * Atomic and idempotent: the membership update only applies while the user is still
 * org-less, otherwise the transaction rolls back and the current row is returned.
 */
export async function ensurePersonalOrganization<
  U extends { id: string; email: string; role: string; firstName?: string | null; organizationId: string | null; activeOrganizationId: string | null },
>(user: U): Promise<{ user: U; created: boolean }> {
  if (user.organizationId || user.role === 'SUPER_ADMIN') return { user, created: false };
  const created = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: personalOrganizationFor(user.id, user.email, user.firstName) });
    const claimed = await tx.user.updateMany({
      where: { id: user.id, organizationId: null },
      data: { organizationId: org.id, activeOrganizationId: org.id },
    });
    if (claimed.count !== 1) throw new AuthError(409, 'Workspace already provisioned', 'CONFLICT');
    return org.id;
  }).catch(async (err) => {
    if (err instanceof AuthError || (err as { code?: string })?.code === 'P2002') {
      const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { organizationId: true, activeOrganizationId: true } });
      if (fresh?.organizationId) return fresh;
    }
    throw err;
  });
  const orgId = typeof created === 'string' ? created : created.organizationId;
  const activeId = typeof created === 'string' ? created : created.activeOrganizationId;
  return { user: { ...user, organizationId: orgId, activeOrganizationId: activeId }, created: typeof created === 'string' };
}
