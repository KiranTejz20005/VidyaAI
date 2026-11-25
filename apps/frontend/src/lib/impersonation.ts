/**
 * Holds the SUPER_ADMIN's own access token while they operate inside another
 * organization's context. The token lives in memory only; sessionStorage keeps
 * a non-secret flag so the "exit" banner survives a reload, in which case the
 * super-admin session is recovered from the httpOnly refresh cookie instead.
 */

const IMPERSONATION_FLAG_KEY = 'vidya_impersonating';
/** Key used by earlier builds that persisted the raw token; removed on sight. */
const LEGACY_TOKEN_KEY = 'original_admin_token';

let originalAdminToken: string | null = null;

export function purgeLegacyImpersonationToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    return;
  }
}

export function beginImpersonation(token: string): void {
  originalAdminToken = token;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(IMPERSONATION_FLAG_KEY, '1');
  } catch {
    return;
  }
}

export function getOriginalAdminToken(): string | null {
  return originalAdminToken;
}

export function hasImpersonationFlag(): boolean {
  if (originalAdminToken) return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(IMPERSONATION_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function endImpersonation(): void {
  originalAdminToken = null;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(IMPERSONATION_FLAG_KEY);
  } catch {
    return;
  }
}
