import { env } from '../config/env';
import { logger } from '../utils/logger';

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_TIMEOUT_MS = 5_000;
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export interface VerifiedGoogleIdentity {
  email: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
}

export class GoogleIdentityError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 401 | 503 = 401,
  ) {
    super(message);
    this.name = 'GoogleIdentityError';
  }
}

interface TokenInfo {
  aud?: string;
  azp?: string;
  iss?: string;
  exp?: string;
  email?: string;
  email_verified?: string | boolean;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

/**
 * Verifies a Google OAuth access token or ID token with Google and returns the
 * account's identity. The token must have been issued to this application
 * (audience = GOOGLE_CLIENT_ID) for a verified email address; otherwise a token
 * minted for any other Google app could be replayed here to sign in.
 */
export async function verifyGoogleToken(token: unknown): Promise<VerifiedGoogleIdentity> {
  const clientIds = env.GOOGLE_CLIENT_ID;
  if (clientIds.length === 0) {
    throw new GoogleIdentityError('Google sign-in is not configured on this server', 503);
  }
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    throw new GoogleIdentityError('Invalid Google token', 400);
  }

  const param = isJwt(token) ? 'id_token' : 'access_token';
  let info: TokenInfo | null;
  try {
    info = await getJson<TokenInfo>(`${TOKENINFO_URL}?${param}=${encodeURIComponent(token)}`);
  } catch (err) {
    logger.warn({ err }, '[GoogleIdentity] tokeninfo request failed');
    throw new GoogleIdentityError('Google verification is temporarily unavailable', 503);
  }
  if (!info) throw new GoogleIdentityError('Invalid Google token');

  const audience = param === 'id_token' ? info.aud : info.azp ?? info.aud;
  if (!audience || !clientIds.includes(audience)) {
    throw new GoogleIdentityError('Google token was not issued for this application');
  }
  if (param === 'id_token' && (!info.iss || !GOOGLE_ISSUERS.has(info.iss))) {
    throw new GoogleIdentityError('Invalid Google token issuer');
  }
  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    throw new GoogleIdentityError('Google token has expired');
  }
  const emailVerified = info.email_verified === true || info.email_verified === 'true';
  if (!info.email || !emailVerified) {
    throw new GoogleIdentityError('Google account email is not verified');
  }

  let profile: TokenInfo = info;
  if (param === 'access_token') {
    try {
      profile = (await getJson<TokenInfo>(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } })) ?? info;
    } catch {
      profile = info;
    }
  }

  return {
    email: info.email.trim().toLowerCase(),
    givenName: profile.given_name,
    familyName: profile.family_name,
    picture: profile.picture,
  };
}
