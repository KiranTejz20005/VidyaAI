import { getRedisClient } from '../../config/redis';
import { logger } from '../../utils/logger';
import { MemoryCounters, MemoryLocks } from './resilient-store';

/**
 * Failed-login lockout. Called by api/auth/controller login. Redis keys
 * login:attempts/* and login:locked/*. Phase 3: atomic lock engage.
 *
 * Redis down: per-instance memory fallback (availability-first on lock *read*).
 */
const ATOMIC_ATTEMPT_AND_LOCK_SCRIPT =
  "local c = redis.call('INCR', KEYS[1]) " +
  "local t = redis.call('PTTL', KEYS[1]) " +
  "if c == 1 or t < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end " +
  "if tonumber(c) >= tonumber(ARGV[2]) then " +
  " redis.call('SET', KEYS[2], '1', 'EX', ARGV[3]) " +
  " redis.call('DEL', KEYS[1]) " +
  ' return {c, 1} end return {c, 0}';

/**
 * Failed-login lockout.
 *
 * Primary store: Redis (shared across instances).
 * Redis down: explicit per-instance in-memory fallback, so lockout still engages
 * (an attacker is limited per instance instead of being unthrottled). This is
 * deliberately fail-closed-per-instance rather than fail-open.
 */
export const LOGIN_MAX_ATTEMPTS_PER_IP = 5;
export const LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = 25;
export const LOGIN_LOCK_SECONDS = 15 * 60;
const REDIS_OP_TIMEOUT_MS = 750;

const memory = new MemoryCounters();
const memoryLocks = new MemoryLocks();

function timeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('redis timeout')), REDIS_OP_TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const memoryLocked = (key: string): boolean => memoryLocks.isLocked(key);

export const lockKeys = (email: string, ip: string) => [`login:locked:${email}:${ip}`, `login:locked:${email}`];

export async function isLoginLocked(keys: string[]): Promise<boolean> {
  if (keys.some(memoryLocked)) return true;
  try {
    const redis = getRedisClient();
    const values = await timeout(Promise.all(keys.map((k) => redis.get(k))));
    return values.some(Boolean);
  } catch (err) {
    logger.warn({ err }, '[auth:login] Lockout store unavailable; relying on in-memory lockout for this instance');
    return false;
  }
}

function recordInMemory(email: string, ipAddress: string): void {
  const specs: Array<[string, string, number]> = [
    [`login:attempts:${email}:${ipAddress}`, `login:locked:${email}:${ipAddress}`, LOGIN_MAX_ATTEMPTS_PER_IP],
    [`login:attempts:${email}`, `login:locked:${email}`, LOGIN_MAX_ATTEMPTS_PER_ACCOUNT],
  ];
  for (const [counterKey, lockKey, max] of specs) {
    const e = memory.hit(counterKey, LOGIN_LOCK_SECONDS * 1000);
    if (e.n >= max) {
      memoryLocks.lock(lockKey, LOGIN_LOCK_SECONDS * 1000);
      memory.reset(counterKey);
    }
  }
}

export async function recordFailedLogin(email: string, ipAddress: string): Promise<void> {
  // Always count in memory so the lockout still works while Redis is down.
  recordInMemory(email, ipAddress);
  try {
    const redis = getRedisClient();
    const counters: Array<[string, string, number]> = [
      [`login:attempts:${email}:${ipAddress}`, `login:locked:${email}:${ipAddress}`, LOGIN_MAX_ATTEMPTS_PER_IP],
      [`login:attempts:${email}`, `login:locked:${email}`, LOGIN_MAX_ATTEMPTS_PER_ACCOUNT],
    ];
    for (const [counterKey, lockKey, max] of counters) {
      await timeout(
        redis.eval(
          ATOMIC_ATTEMPT_AND_LOCK_SCRIPT,
          2,
          counterKey,
          lockKey,
          String(LOGIN_LOCK_SECONDS * 1000),
          String(max),
          String(LOGIN_LOCK_SECONDS),
        ) as Promise<unknown>,
      );
    }
  } catch (err) {
    logger.warn({ err }, '[auth:login] Redis unavailable; failed attempt tracked in memory only');
  }
}

export async function clearFailedLogins(email: string, ipAddress: string): Promise<void> {
  memory.reset(`login:attempts:${email}:${ipAddress}`);
  memory.reset(`login:attempts:${email}`);
  memoryLocks.unlock(`login:locked:${email}:${ipAddress}`);
  memoryLocks.unlock(`login:locked:${email}`);
  try {
    const redis = getRedisClient();
    await timeout(Promise.all([
      redis.del(`login:attempts:${email}:${ipAddress}`),
      redis.del(`login:locked:${email}:${ipAddress}`),
      redis.del(`login:attempts:${email}`),
      redis.del(`login:locked:${email}`),
    ]));
  } catch {
    // Best effort; counters expire on their own.
  }
}
