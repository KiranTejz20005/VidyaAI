import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
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
} from './controller';

const router = Router();

const limiter = (windowMs: number, max: number, error: string) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { success: false, error, code: 'RATE_LIMITED' } });

// Per-IP ceilings sized for many users behind one school NAT. Credential
// guessing is throttled per account in the login handler itself.
const authLimiter = limiter(15 * 60 * 1000, 20, 'Too many authentication attempts. Please try again later.');
const refreshLimiter = limiter(60 * 1000, 5, 'Too many refresh attempts. Please try again later.');
const recoveryLimiter = limiter(60 * 60 * 1000, 10, 'Too many password reset requests. Please try again later.');

router.get('/public-organizations', asyncHandler(getPublicOrganizations));
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

export default router;
