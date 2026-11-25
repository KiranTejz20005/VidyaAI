import crypto from 'crypto';
import { z } from 'zod';

/**
 * Upper bound on accepted password length. Argon2 cost scales with input
 * length, so an unbounded password is a cheap CPU-exhaustion vector.
 */
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_LENGTH = 8;

/** Single password policy for every flow that sets a new password. */
export const passwordPolicySchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');

/** Returns an error message if the password violates policy, otherwise null. */
export function validatePasswordPolicy(password: unknown): string | null {
  const result = passwordPolicySchema.safeParse(password);
  return result.success ? null : result.error.issues[0]?.message ?? 'Invalid password';
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(charset: string): string {
  return charset[crypto.randomInt(charset.length)];
}

/**
 * Generates a cryptographically random one-time password that satisfies the
 * password policy. Ambiguous glyphs (0/O, 1/l/I) are excluded so it can be
 * read aloud or copied by hand. Callers must set `forcePasswordReset: true`.
 */
export function generateTemporaryPassword(length = 16): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const SENSITIVE_USER_FIELDS = ['passwordHash', 'googleId'] as const;
type SensitiveUserField = (typeof SENSITIVE_USER_FIELDS)[number];

/** Strips credential material from a user record before it leaves the API. */
export function toSafeUser<T extends object>(user: T): Omit<T, SensitiveUserField> {
  const copy: Record<string, unknown> = { ...(user as Record<string, unknown>) };
  for (const field of SENSITIVE_USER_FIELDS) delete copy[field];
  return copy as Omit<T, SensitiveUserField>;
}

/** SHA-256 hex digest used for storing opaque bearer secrets (refresh/reset/invite tokens). */
export function hashOpaqueToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Constant-time string comparison that tolerates inputs of different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
