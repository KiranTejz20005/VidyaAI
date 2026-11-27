import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ResilientRedisStore } from './resilient-store';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  signupSchema,
  loginSchema,
  acceptInviteSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  changePasswordSchema,
  switchOrganizationSchema,
  googleSigninSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateOrganizationSchema,
} from './validators';
import {
  signup,
  login,
  refresh,
  logout,
  logoutAll,
  acceptInvite,
  getPublicOrganizations,
  getMe,
  updateProfile,
  updatePreferences,
  changePassword,
  getSessions,
  revokeSessionById,
  switchOrganization,
  getUserOrganizations,
  getStorageUsage,
  completeOnboarding,
  googleSignin,
  forgotPassword,
  resetPassword,
  updateOrganization,
} from './controller';

const router = Router();

const limiter = (name: string, windowMs: number, max: number, error: string) =>
  rateLimit({ windowMs, max, store: new ResilientRedisStore(name), standardHeaders: true, legacyHeaders: false, message: { success: false, error, code: 'RATE_LIMITED' } });

// Per-IP ceilings sized for many users behind one school NAT. Credential
// guessing is throttled per account in the login handler itself.
const authLimiter = limiter('auth', 15 * 60 * 1000, 20, 'Too many authentication attempts. Please try again later.');
const refreshLimiter = limiter('refresh', 60 * 1000, 5, 'Too many refresh attempts. Please try again later.');
const recoveryLimiter = limiter('recovery', 60 * 60 * 1000, 10, 'Too many password reset requests. Please try again later.');

const publicLimiter = limiter('public', 60 * 1000, 30, 'Too many requests. Please try again later.');

router.get('/public-organizations', publicLimiter, asyncHandler(getPublicOrganizations));
router.post('/signup', authLimiter, validate(signupSchema), asyncHandler(signup));
router.post('/accept-invite', authLimiter, validate(acceptInviteSchema), asyncHandler(acceptInvite));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(login));
router.post('/google', authLimiter, validate(googleSigninSchema), asyncHandler(googleSignin));
router.post('/forgot-password', recoveryLimiter, validate(forgotPasswordSchema), asyncHandler(forgotPassword));
router.post('/reset-password', recoveryLimiter, validate(resetPasswordSchema), asyncHandler(resetPassword));
router.post('/refresh', refreshLimiter, asyncHandler(refresh));
router.post('/logout', authLimiter, asyncHandler(logout));

router.use(authenticate);

router.get('/me', asyncHandler(getMe));
router.put('/me/profile', validate(updateProfileSchema), asyncHandler(updateProfile));
router.put('/me/preferences', validate(updatePreferencesSchema), asyncHandler(updatePreferences));
router.put('/me/password', validate(changePasswordSchema), asyncHandler(changePassword));
router.get('/me/sessions', asyncHandler(getSessions));
router.delete('/me/sessions/:id', asyncHandler(revokeSessionById));
router.post('/me/logout-all', asyncHandler(logoutAll));
router.post('/me/switch-organization', validate(switchOrganizationSchema), asyncHandler(switchOrganization));
router.get('/me/organizations', asyncHandler(getUserOrganizations));
router.get('/me/storage', asyncHandler(getStorageUsage));
router.post('/onboarding/complete', asyncHandler(completeOnboarding));
router.put('/me/organization', authorize(['ADMIN']), validate(updateOrganizationSchema), asyncHandler(updateOrganization));

export default router;
