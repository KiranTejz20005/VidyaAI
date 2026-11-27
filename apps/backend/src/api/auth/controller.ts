import { Request, Response } from 'express';
import prisma from '../../config/prisma';
import { isLoginLocked, lockKeys, recordFailedLogin, clearFailedLogins } from './lockout';
import { Prisma } from '@prisma/client';
import { logger as baseLogger } from '../../utils/logger';
import { AuditService } from '../../services/audit.service';
import {
  AuthError,
  assertUserCanAuthenticate,
  createPasswordResetToken,
  createUserWithPersonalOrganization,
  ensurePersonalOrganization,
  getSessionIdForRefreshToken,
  hashPassword,
  issueAccessTokenForUser,
  resetPasswordWithToken,
  revokeAllUserSessions,
  revokeSession,
  rotateRefreshToken,
  startSession,
  verifyAgainstDummyHash,
  verifyPassword,
} from '../../services/auth.service';
import { GoogleIdentityError, verifyGoogleToken } from '../../services/google-identity.service';
import { sendPasswordResetEmail } from '../../services/email.service';
import { validateInvitationToken } from '../../services/invitation.service';
import { sendSuccess, sendCreated, sendError, sendUnauthorized, sendNotFound, sendBadRequest, sendConflict, sendForbidden } from '../common/response';
import { getRequestUserId } from '../../security/request-context';
import {
  signupSchema,
  loginSchema,
  refreshSchema,
  acceptInviteSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  changePasswordSchema,
  switchOrganizationSchema,
  sessionIdParamSchema,
  googleSigninSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateOrganizationSchema,
} from './validators';
import {
  serializeAuthTokens,
  serializeProfile,
  serializeStorageUsage,
  serializeOrganizationRef,
  serializeSession,
} from './serializers';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ORG_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024;
const PASSWORD_RESET_EXPIRY_MINUTES = 30;


/** Roles a person may choose for themselves when creating an account. */
const SELF_SERVICE_ROLES = new Set(['STUDENT', 'TEACHER']);

type Log = typeof baseLogger;
function log(req: Request): Log {
  return ((req as unknown as { logger?: Log }).logger ?? baseLogger);
}

function clientMeta(req: Request): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: req.ip || '0.0.0.0',
    userAgent: String(req.headers['user-agent'] || 'unknown').slice(0, 512),
  };
}

function getCookieDomain(): string | undefined {
  if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
    try {
      const frontendUrl = new URL(process.env.FRONTEND_URL.split(',')[0]);
      const hostname = frontendUrl.hostname.replace(/^www\./, '');
      return hostname.includes('.') && !hostname.startsWith('localhost') ? '.' + hostname : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function refreshCookieOptions() {
  const production = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: (production ? 'none' : 'lax') as 'none' | 'lax',
    domain: getCookieDomain(),
    path: '/',
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...refreshCookieOptions(), maxAge: REFRESH_COOKIE_MAX_AGE_MS });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

/** Maps service-level auth failures to HTTP responses; anything else is a 500. */
function respondAuthFailure(req: Request, res: Response, error: unknown, context: string, fallback: string): void {
  if (error instanceof AuthError) {
    sendError(res, { error: error.message, code: error.code, statusCode: error.status });
    return;
  }
  if (error instanceof GoogleIdentityError) {
    sendError(res, { error: error.message, code: 'GOOGLE_AUTH_FAILED', statusCode: error.statusCode });
    return;
  }
  log(req).error({ err: error }, `[auth:${context}]`);
  sendError(res, { error: fallback, statusCode: 500 });
}

/** Creates a session, sets the refresh cookie and returns the access token for a user. */
async function establishSession(
  req: Request,
  res: Response,
  user: Parameters<typeof issueAccessTokenForUser>[0],
): Promise<string> {
  const { refreshToken } = await startSession(user.id, clientMeta(req));
  setRefreshCookie(res, refreshToken);
  return issueAccessTokenForUser(user);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signup / login / tokens
// ─────────────────────────────────────────────────────────────────────────────

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = signupSchema.parse({ body: req.body });
    const { email, password, firstName, lastName, role } = body;
    const { ipAddress, userAgent } = clientMeta(req);

    // Hash before the lookup so a duplicate email costs the same time as a new one.
    const passwordHash = await hashPassword(password);
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      // Anti-enumeration: same status/message shape as success; no session issued.
      log(req).info({ email }, '[auth:signup] duplicate email suppressed');
      sendCreated(res, { accessToken: null, user: null }, 'Account created successfully');
      return;
    }

    // Role comes from the closed self-service set only; the user and an isolated
    // personal workspace are created atomically. Never attaches to an existing org.
    let user;
    try {
      user = await createUserWithPersonalOrganization({
        email,
        passwordHash,
        firstName,
        lastName,
        role: role === 'STUDENT' ? 'STUDENT' : 'TEACHER',
        emailVerified: false,
        hasCompletedOnboarding: false,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        log(req).info({ email }, '[auth:signup] unique race suppressed');
        sendCreated(res, { accessToken: null, user: null }, 'Account created successfully');
        return;
      }
      throw err;
    }

    await prisma.loginHistory.create({ data: { userId: user.id, ipAddress, userAgent, status: 'SIGNUP_SUCCESS' } }).catch(() => undefined);
    await AuditService.logAuditEvent({
      action: 'SIGNUP_SUCCESS', userId: user.id, entity: 'User', entityId: user.id, ipAddress, userAgent,
    });

    const accessToken = await establishSession(req, res, user);
    sendCreated(res, serializeAuthTokens(accessToken, user), 'Account created successfully');
  } catch (error) {
    respondAuthFailure(req, res, error, 'signup', 'Registration failed. Please try again later.');
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = loginSchema.parse({ body: req.body });
    const { email, password } = body;
    const { ipAddress, userAgent } = clientMeta(req);

    if (await isLoginLocked(lockKeys(email, ipAddress))) {
      sendError(res, { error: 'Too many failed login attempts. Try again in 15 minutes.', code: 'RATE_LIMITED', statusCode: 429 });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      // Equalise timing with the real verification path, then fail generically.
      await verifyAgainstDummyHash(password);
      await recordFailedLogin(email, ipAddress);
      sendUnauthorized(res, 'Invalid email or password');
      return;
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      await prisma.loginHistory.create({ data: { userId: user.id, ipAddress, userAgent, status: 'FAILED_PASSWORD' } }).catch(() => undefined);
      await AuditService.logAuditEvent({
        action: 'LOGIN_FAILED', userId: user.id, organizationId: user.organizationId || undefined,
        ipAddress, userAgent, metadata: { reason: 'FAILED_PASSWORD' },
      });
      await recordFailedLogin(email, ipAddress);
      sendUnauthorized(res, 'Invalid email or password');
      return;
    }

    // Account state is only revealed to someone who proved the password.
    await assertUserCanAuthenticate(user);
    await clearFailedLogins(email, ipAddress);
    const sessionUser = (await ensurePersonalOrganization(user)).user;

    await prisma.loginHistory.create({ data: { userId: user.id, ipAddress, userAgent, status: 'SUCCESS' } }).catch(() => undefined);
    await AuditService.logAuditEvent({
      action: 'LOGIN_SUCCESS', userId: user.id, organizationId: user.organizationId || undefined, ipAddress, userAgent,
    });

    const accessToken = await establishSession(req, res, sessionUser);
    sendSuccess(res, { data: serializeAuthTokens(accessToken, sessionUser), message: 'Login successful' });
  } catch (error) {
    respondAuthFailure(req, res, error, 'login', 'Authentication failed');
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    refreshSchema.parse({ body: req.body ?? {} });
    const rawToken: unknown = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (typeof rawToken !== 'string' || rawToken.length === 0 || rawToken.length > 256) {
      sendUnauthorized(res, 'Refresh token missing');
      return;
    }
    const { accessToken, newRefreshToken } = await rotateRefreshToken(rawToken);
    setRefreshCookie(res, newRefreshToken);
    sendSuccess(res, { data: { accessToken } });
  } catch (error) {
    clearRefreshCookie(res);
    if (error instanceof AuthError) {
      sendError(res, { error: error.message, code: error.code === 'UNAUTHORIZED' ? 'INVALID_REFRESH_TOKEN' : error.code, statusCode: error.status });
      return;
    }
    log(req).error({ err: error }, '[auth:refresh]');
    sendError(res, { error: 'Token refresh failed', code: 'INVALID_REFRESH_TOKEN', statusCode: 401 });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof rawToken === 'string' && rawToken.length > 0) {
      await revokeSession(rawToken);
    }
  } catch (error) {
    log(req).warn({ err: error }, '[auth:logout] Session revocation failed');
  }
  clearRefreshCookie(res);
  sendSuccess(res, { data: null, message: 'Logged out successfully' });
};

/** Signs the user out of every device, including this one. */
export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  try {
    await revokeAllUserSessions(getRequestUserId(req));
    clearRefreshCookie(res);
    sendSuccess(res, { data: null, message: 'Signed out of all sessions' });
  } catch (error) {
    respondAuthFailure(req, res, error, 'logoutAll', 'Failed to sign out of all sessions');
  }
};

export const acceptInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = acceptInviteSchema.parse({ body: req.body });
    const { token, password, firstName, lastName } = body;

    let invitation;
    try {
      invitation = await validateInvitationToken(token);
    } catch {
      sendBadRequest(res, 'This invitation is invalid, already used, or expired.');
      return;
    }
    const email = invitation.email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    // Claim the invitation and create the account atomically so an invite can
    // only ever produce one account, even under concurrent submissions.
    const user = await prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) return null;
      return tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: invitation.role,
          organizationId: invitation.organizationId,
          activeOrganizationId: invitation.organizationId,
          // The invitation token was delivered to this address, so ownership is proven.
          emailVerified: true,
          hasCompletedOnboarding: false,
        },
      });
    });

    if (!user) {
      sendBadRequest(res, 'This invitation is invalid, already used, or expired.');
      return;
    }

    const { ipAddress, userAgent } = clientMeta(req);
    await AuditService.logAuditEvent({
      action: 'INVITATION_ACCEPTED', entity: 'User', entityId: user.id,
      userId: user.id, organizationId: user.organizationId || undefined, ipAddress, userAgent,
    });

    sendCreated(res, { id: user.id, email: user.email }, 'Account created successfully');
  } catch (error) {
    respondAuthFailure(req, res, error, 'acceptInvite', 'Failed to accept invitation');
  }
};

export const googleSignin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = googleSigninSchema.parse({ body: req.body });
    const requestedRole = body.role === 'FACULTY' ? 'TEACHER' : body.role;
    const { ipAddress, userAgent } = clientMeta(req);

    const identity = await verifyGoogleToken(body.token);

    let user = await prisma.user.findUnique({ where: { email: identity.email } });

    if (user) {
      // Role is bound to the account - never accept a client-selected role on login.
      await assertUserCanAuthenticate(user);
      const updateData: { authProvider?: string; avatar?: string; emailVerified?: boolean; passwordHash?: null } = {};
      let wipedUnverifiedPassword = false;
      if (user.authProvider === 'LOCAL') updateData.authProvider = 'GOOGLE';
      if (!user.emailVerified) {
        // Google just proved control of this address. A password set while the address
        // was still unverified may belong to someone who pre-registered it (account
        // pre-hijacking), so it is discarded; the owner can set one via password reset.
        updateData.emailVerified = true;
        if (user.passwordHash) {
          updateData.passwordHash = null;
          wipedUnverifiedPassword = true;
        }
      }
      if (identity.picture && !user.avatar) updateData.avatar = identity.picture;
      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data: updateData });
      }
      if (wipedUnverifiedPassword) {
        await revokeAllUserSessions(user.id);
        await AuditService.logAuditEvent({
          action: 'GOOGLE_ACCOUNT_LINKED', userId: user.id, entity: 'User', entityId: user.id, ipAddress, userAgent,
          metadata: { unverifiedPasswordRemoved: true },
        });
      }
      user = (await ensurePersonalOrganization(user)).user;
    } else {
      if (!body.isSignUp) {
        sendError(res, { error: 'Account not found. Please sign up first.', code: 'ACCOUNT_NOT_FOUND', statusCode: 404 });
        return;
      }
      if (!requestedRole || !SELF_SERVICE_ROLES.has(requestedRole)) {
        sendForbidden(res, 'Administrator accounts are created by invitation only.');
        return;
      }
      try {
        user = await createUserWithPersonalOrganization({
          email: identity.email,
          authProvider: 'GOOGLE',
          firstName: (identity.givenName || 'New').slice(0, 100),
          lastName: (identity.familyName || 'User').slice(0, 100),
          avatar: identity.picture || null,
          role: requestedRole as 'STUDENT' | 'TEACHER',
          emailVerified: true,
          hasCompletedOnboarding: false,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          sendError(res, { error: 'Google authentication failed', statusCode: 409 });
          return;
        }
        throw err;
      }
      await AuditService.logAuditEvent({
        action: 'SIGNUP_SUCCESS', userId: user.id, entity: 'User', entityId: user.id, ipAddress, userAgent,
        metadata: { provider: 'GOOGLE' },
      });
    }

    await prisma.loginHistory.create({ data: { userId: user.id, ipAddress, userAgent, status: 'SUCCESS' } }).catch(() => undefined);
    await AuditService.logAuditEvent({
      action: 'LOGIN_SUCCESS', userId: user.id, organizationId: user.organizationId || undefined, ipAddress, userAgent,
      metadata: { provider: 'GOOGLE' },
    });

    const accessToken = await establishSession(req, res, user);
    sendSuccess(res, { data: serializeAuthTokens(accessToken, user), message: 'Google Sign-In successful' });
  } catch (error) {
    respondAuthFailure(req, res, error, 'googleSignin', 'Google authentication failed');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Password recovery
// ─────────────────────────────────────────────────────────────────────────────

const FORGOT_PASSWORD_RESPONSE = 'If an account exists for that email, a password reset link has been sent.';

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = forgotPasswordSchema.parse({ body: req.body });
    const reset = await createPasswordResetToken(body.email);
    if (reset) {
      await sendPasswordResetEmail(body.email, reset.rawToken, PASSWORD_RESET_EXPIRY_MINUTES);
      const { ipAddress, userAgent } = clientMeta(req);
      await AuditService.logAuditEvent({ action: 'PASSWORD_RESET_REQUESTED', userId: reset.userId, ipAddress, userAgent });
    }
  } catch (error) {
    log(req).error({ err: error }, '[auth:forgotPassword]');
  }
  // Identical response whether or not the account exists (no enumeration).
  sendSuccess(res, { data: null, message: FORGOT_PASSWORD_RESPONSE });
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = resetPasswordSchema.parse({ body: req.body });
    const userId = await resetPasswordWithToken(body.token, body.newPassword);
    const { ipAddress, userAgent } = clientMeta(req);
    await AuditService.logAuditEvent({ action: 'PASSWORD_RESET_COMPLETED', userId, ipAddress, userAgent });
    clearRefreshCookie(res);
    sendSuccess(res, { data: null, message: 'Your password has been reset. Please sign in.' });
  } catch (error) {
    respondAuthFailure(req, res, error, 'resetPassword', 'Failed to reset password');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Current user
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unauthenticated. The client only calls this to receive the CSRF cookie, and
 * self-service signup never joins an existing organization (that requires an
 * invitation), so no tenant data is exposed: always an empty list.
 */
export const getPublicOrganizations = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, { data: [] });
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: getRequestUserId(req) },
      include: { organization: true, department: true },
    });
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }
    sendSuccess(res, { data: serializeProfile(user, user.organization?.name, user.department?.name) });
  } catch (error) {
    respondAuthFailure(req, res, error, 'getMe', 'Failed to fetch profile');
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = updateProfileSchema.parse({ body: req.body });
    const userId = getRequestUserId(req);
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
      sendNotFound(res, 'User not found');
      return;
    }

    const emailChanged = body.email !== undefined && body.email !== current.email;
    if (emailChanged) {
      // Changing the sign-in identifier requires proving account ownership,
      // so a stolen access token cannot be used to take over the account.
      if (!current.passwordHash) {
        sendBadRequest(res, 'The email of a Google account cannot be changed here.');
        return;
      }
      if (!body.currentPassword || !(await verifyPassword(body.currentPassword, current.passwordHash))) {
        sendBadRequest(res, 'Enter your current password to change your email address.');
        return;
      }
      const taken = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
      if (taken) {
        sendConflict(res, 'That email address is already in use.');
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.firstName && { firstName: body.firstName }),
        ...(body.lastName && { lastName: body.lastName }),
        ...(emailChanged && { email: body.email }),
        ...(body.avatar !== undefined && { avatar: body.avatar }),
      },
      include: { organization: true },
    });
    if (emailChanged) {
      const { ipAddress, userAgent } = clientMeta(req);
      await AuditService.logAuditEvent({ action: 'EMAIL_CHANGED', userId, ipAddress, userAgent });
    }
    sendSuccess(res, { data: serializeProfile(user, user.organization?.name), message: 'Profile updated successfully' });
  } catch (error) {
    respondAuthFailure(req, res, error, 'updateProfile', 'Failed to update profile');
  }
};

export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = updatePreferencesSchema.parse({ body: req.body });
    const userId = getRequestUserId(req);
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    const merged = {
      ...((current?.preferences as Record<string, unknown> | null) ?? {}),
      ...body.preferences,
    };
    const user = await prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as object },
    });
    sendSuccess(res, { data: { preferences: user.preferences }, message: 'Preferences updated successfully' });
  } catch (error) {
    respondAuthFailure(req, res, error, 'updatePreferences', 'Failed to update preferences');
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = changePasswordSchema.parse({ body: req.body });
    const userId = getRequestUserId(req);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }
    if (!user.passwordHash) {
      sendBadRequest(res, 'This account uses Google Sign-In, so it has no password to change.');
      return;
    }

    const forced = user.forcePasswordReset === true;
    if (!forced) {
      if (!body.currentPassword) {
        sendBadRequest(res, 'Current password is required');
        return;
      }
      if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
        sendBadRequest(res, 'Incorrect current password');
        return;
      }
      if (body.currentPassword === body.newPassword) {
        sendBadRequest(res, 'Choose a password different from your current one.');
        return;
      }
    } else if (await verifyPassword(body.newPassword, user.passwordHash)) {
      sendBadRequest(res, 'Choose a password different from your temporary one.');
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(body.newPassword), forcePasswordReset: false },
    });

    // Keep this device signed in; sign out every other session.
    const currentSessionId = await getSessionIdForRefreshToken(req.cookies?.[REFRESH_COOKIE_NAME]);
    await revokeAllUserSessions(userId, currentSessionId);

    const { ipAddress, userAgent } = clientMeta(req);
    await AuditService.logAuditEvent({ action: 'PASSWORD_CHANGED', userId, ipAddress, userAgent });

    // The new access token no longer carries the forced-reset claim.
    sendSuccess(res, { data: { accessToken: issueAccessTokenForUser(updated) }, message: 'Password changed successfully' });
  } catch (error) {
    respondAuthFailure(req, res, error, 'changePassword', 'Failed to change password');
  }
};

export const getSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: getRequestUserId(req), isActive: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    sendSuccess(res, { data: sessions.map(serializeSession) });
  } catch (error) {
    respondAuthFailure(req, res, error, 'getSessions', 'Failed to fetch sessions');
  }
};

export const revokeSessionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { params } = sessionIdParamSchema.parse({ params: req.params });
    const userId = getRequestUserId(req);
    const session = await prisma.session.findFirst({ where: { id: params.id, userId }, select: { id: true } });
    if (!session) {
      sendNotFound(res, 'Session not found');
      return;
    }
    await prisma.refreshToken.updateMany({ where: { sessionId: session.id }, data: { isRevoked: true } });
    await prisma.session.update({ where: { id: session.id }, data: { isActive: false } });
    sendSuccess(res, { data: null, message: 'Session revoked successfully' });
  } catch (error) {
    respondAuthFailure(req, res, error, 'revokeSessionById', 'Failed to revoke session');
  }
};

export const switchOrganization = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = switchOrganizationSchema.parse({ body: req.body });
    const userId = getRequestUserId(req);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }

    if (user.role === 'SUPER_ADMIN') {
      const org = await prisma.organization.findUnique({ where: { id: body.organizationId }, select: { id: true } });
      if (!org) {
        sendNotFound(res, 'Organization not found');
        return;
      }
    } else if (user.organizationId !== body.organizationId) {
      sendForbidden(res, 'Access denied to this organization');
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { activeOrganizationId: body.organizationId },
      include: { organization: true },
    });

    sendSuccess(res, {
      data: { accessToken: issueAccessTokenForUser(updatedUser), organizationName: updatedUser.organization?.name },
      message: 'Switched organization successfully',
    });
  } catch (error) {
    respondAuthFailure(req, res, error, 'switchOrganization', 'Failed to switch organization');
  }
};

export const getUserOrganizations = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: getRequestUserId(req) },
      select: { role: true, organizationId: true },
    });
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }

    let orgs: Record<string, unknown>[] = [];
    if (user.role === 'SUPER_ADMIN') {
      orgs = await prisma.organization.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, email: true },
        take: 1000,
      });
    } else if (user.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { id: true, name: true, code: true, email: true },
      });
      if (org) orgs = [org];
    }

    sendSuccess(res, { data: orgs.map((o) => serializeOrganizationRef(o, user.role)) });
  } catch (error) {
    respondAuthFailure(req, res, error, 'getUserOrganizations', 'Failed to fetch organizations');
  }
};

export const getStorageUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: getRequestUserId(req) },
      select: { organizationId: true },
    });
    if (!user?.organizationId) {
      sendSuccess(res, { data: serializeStorageUsage(0, ORG_STORAGE_LIMIT_BYTES) });
      return;
    }
    const usage = await prisma.storedFile.aggregate({
      where: { organizationId: user.organizationId },
      _sum: { sizeBytes: true },
    });
    sendSuccess(res, { data: serializeStorageUsage(usage._sum.sizeBytes ?? 0, ORG_STORAGE_LIMIT_BYTES) });
  } catch (error) {
    respondAuthFailure(req, res, error, 'getStorageUsage', 'Failed to calculate storage');
  }
};

export const completeOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await prisma.user.update({
      where: { id: getRequestUserId(req) },
      data: { hasCompletedOnboarding: true, onboardingCompletedAt: new Date() },
    });
    const { user, created } = await ensurePersonalOrganization(updated);
    sendSuccess(res, {
      data: {
        hasCompletedOnboarding: user.hasCompletedOnboarding,
        // The JWT carries the organization id, so hand back a fresh token when one was just created.
        ...(created ? { accessToken: issueAccessTokenForUser(user) } : {}),
      },
      message: 'Onboarding completed successfully',
    });
  } catch (error) {
    respondAuthFailure(req, res, error, 'completeOnboarding', 'Failed to complete onboarding');
  }
};

/** Admin-only (see routes): rename the caller's own organization and/or set their department. */
export const updateOrganization = async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = updateOrganizationSchema.parse({ body: req.body });
    const userId = getRequestUserId(req);
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
      sendNotFound(res, 'User not found');
      return;
    }

    let user = current;
    if (body.organizationName) {
      if (!user.organizationId) {
        user = (await ensurePersonalOrganization(user)).user as typeof current;
      }
      if (user.organizationId) {
        await prisma.organization.update({ where: { id: user.organizationId }, data: { name: body.organizationName } });
      }
    }

    if (body.department && user.organizationId) {
      const existing = await prisma.department.findFirst({
        where: { name: body.department, organizationId: user.organizationId },
      });
      const dept = existing ?? (await prisma.department.create({ data: { name: body.department, organizationId: user.organizationId } }));
      user = await prisma.user.update({ where: { id: userId }, data: { departmentId: dept.id } });
    }

    sendSuccess(res, {
      data: {
        organizationName: body.organizationName,
        department: body.department,
        academicYear: body.academicYear,
        accessToken: issueAccessTokenForUser(user),
      },
      message: 'Organization settings updated',
    });
  } catch (error) {
    respondAuthFailure(req, res, error, 'updateOrganization', 'Failed to update organization');
  }
};
