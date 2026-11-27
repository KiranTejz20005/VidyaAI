/**
 * Pure helpers used by the axios client (src/lib/api.ts) for session refresh,
 * CSRF cookie detection and forced-password-reset detection. Kept free of
 * browser/axios imports so they can be unit tested in a node environment.
 */

/**
 * Wraps an async task so that concurrent callers share one in-flight promise.
 * Once the promise settles the next call starts a fresh task.
 */
export function createSingleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (!inflight) {
      inflight = task().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}

export interface RetriableRequestConfig {
  url?: string;
  _retry?: boolean;
}

/** Endpoints whose 401 means "bad credentials / no session", never "access token expired". */
const NON_REFRESHABLE_ENDPOINTS = [
  '/auth/refresh',
  '/auth/login',
  '/auth/logout',
  '/auth/google',
  '/auth/signup',
  '/auth/otp',
  '/auth/forgot-password',
  '/auth/reset-password',
];

/** True when a 401 for this request should trigger exactly one refresh-and-retry. */
export function shouldRefreshOn401(config: RetriableRequestConfig | undefined | null): boolean {
  if (!config || config._retry) return false;
  const url = config.url ?? '';
  return !NON_REFRESHABLE_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

export const PASSWORD_RESET_REQUIRED_CODE = 'PASSWORD_RESET_REQUIRED';

export function isPasswordResetRequiredResponse(status: number | undefined, data: unknown): boolean {
  if (status !== 403 || !data || typeof data !== 'object') return false;
  return (data as { code?: unknown }).code === PASSWORD_RESET_REQUIRED_CODE;
}

/** Reads a cookie value by exact name from a `document.cookie` style string. */
export function readCookie(cookieString: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieString.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export const PASSWORD_POLICY_HINT =
  'Use 8-128 characters with at least one uppercase letter, one lowercase letter and one number.';

/** Password policy mirrored from the backend: 8-128 chars, upper + lower case letter and a digit. */
export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (password.length > 128) return 'Password must be at most 128 characters long.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/\d/.test(password)) return 'Password must contain at least one number.';
  return null;
}
