import type { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { getRedisClient } from '../../config/redis';
import { logger } from '../../utils/logger';

const REDIS_OP_TIMEOUT_MS = 750;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('redis timeout')), REDIS_OP_TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export const MEMORY_MAX_ENTRIES = 10_000;
const MEMORY_SWEEP_INTERVAL_MS = 60_000;

/**
 * Atomic INCR that guarantees a TTL: a single Lua script increments and sets
 * PEXPIRE when the key is new (or somehow has no TTL), so a counter can never
 * outlive a crash between two separate commands. Returns the count and the
 * remaining TTL in ms.
 */
export const ATOMIC_INCR_SCRIPT =
  "local c = redis.call('INCR', KEYS[1]) " +
  "local t = redis.call('PTTL', KEYS[1]) " +
  "if c == 1 or t < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) t = tonumber(ARGV[1]) end " +
  'return {c, t}';

export async function atomicIncr(
  redis: { eval: (...args: any[]) => Promise<unknown> },
  key: string,
  ttlMs: number,
): Promise<{ count: number; ttlMs: number }> {
  const res = (await withTimeout(redis.eval(ATOMIC_INCR_SCRIPT, 1, key, String(ttlMs)) as Promise<unknown>)) as [number, number];
  return { count: Number(res[0]), ttlMs: Number(res[1]) };
}

/**
 * Insertion-ordered map with expiry, a hard size cap (oldest-first eviction)
 * and a throttled periodic sweep, so memory stays bounded under key-spray
 * attacks without an O(n) scan on every insert.
 */
export class BoundedExpiryMap<V extends { expiresAt: number }> {
  protected readonly map = new Map<string, V>();
  private lastSweep = Date.now();

  constructor(
    private readonly maxEntries = MEMORY_MAX_ENTRIES,
    private readonly sweepIntervalMs = MEMORY_SWEEP_INTERVAL_MS,
  ) {}

  get size(): number {
    return this.map.size;
  }

  getLive(key: string): V | undefined {
    const v = this.map.get(key);
    if (!v) return undefined;
    if (v.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return v;
  }

  /** Inserts as the newest entry (re-setting a key moves it to the end). */
  put(key: string, value: V): void {
    const now = Date.now();
    this.map.delete(key);
    this.map.set(key, value);
    if (now - this.lastSweep >= this.sweepIntervalMs) this.sweep(now);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  sweep(now = Date.now()): void {
    this.lastSweep = now;
    for (const [k, v] of this.map) if (v.expiresAt <= now) this.map.delete(k);
  }
}

/** Per-key lock expiries (key -> unix ms), bounded like any BoundedExpiryMap. */
export class MemoryLocks {
  private readonly inner: BoundedExpiryMap<{ expiresAt: number }>;
  constructor(maxEntries?: number, sweepIntervalMs?: number) {
    this.inner = new BoundedExpiryMap(maxEntries, sweepIntervalMs);
  }
  lock(key: string, ttlMs: number): void {
    this.inner.put(key, { expiresAt: Date.now() + ttlMs });
  }
  isLocked(key: string): boolean {
    return this.inner.getLive(key) !== undefined;
  }
  unlock(key: string): void {
    this.inner.delete(key);
  }
  get size(): number {
    return this.inner.size;
  }
}

/**
 * Tiny in-process counter used when Redis is unavailable. It is per-instance, so it
 * only approximates the shared limit, but it keeps throttling active (fail-closed
 * for each instance) instead of silently disabling rate limiting.
 */
export class MemoryCounters {
  private readonly inner: BoundedExpiryMap<{ n: number; resetAt: number; expiresAt: number }>;

  constructor(maxEntries?: number, sweepIntervalMs?: number) {
    this.inner = new BoundedExpiryMap(maxEntries, sweepIntervalMs);
  }

  get size(): number {
    return this.inner.size;
  }

  hit(key: string, windowMs: number): { n: number; resetAt: number } {
    let e = this.inner.getLive(key);
    if (!e) {
      const resetAt = Date.now() + windowMs;
      e = { n: 0, resetAt, expiresAt: resetAt };
      this.inner.put(key, e);
    }
    e.n += 1;
    return e;
  }

  decrement(key: string): void {
    const e = this.inner.getLive(key);
    if (e && e.n > 0) e.n -= 1;
  }

  reset(key: string): void {
    this.inner.delete(key);
  }

  get(key: string): { n: number; resetAt: number } | undefined {
    return this.inner.getLive(key);
  }
}

/**
 * express-rate-limit store backed by the shared ioredis client (no extra dependency)
 * so limits hold across instances. If Redis errors or times out it degrades to
 * per-instance in-memory counters rather than failing open.
 */
export class ResilientRedisStore implements Store {
  windowMs = 60_000;
  private readonly fallback = new MemoryCounters();
  readonly prefix: string;
  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private k(key: string): string {
    return `rl:${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      const redis = getRedisClient();
      const rk = this.k(key);
      const { count: totalHits, ttlMs: ttl } = await atomicIncr(redis, rk, this.windowMs);
      return { totalHits, resetTime: new Date(Date.now() + ttl) };
    } catch (err) {
      logger.warn({ err }, `[rate-limit:${this.prefix}] Redis store unavailable; using in-memory counters`);
      const e = this.fallback.hit(key, this.windowMs);
      return { totalHits: e.n, resetTime: new Date(e.resetAt) };
    }
  }

  async decrement(key: string): Promise<void> {
    this.fallback.decrement(key);
    try {
      await withTimeout(getRedisClient().decr(this.k(key)));
    } catch {
      /* best effort */
    }
  }

  async resetKey(key: string): Promise<void> {
    this.fallback.reset(key);
    try {
      await withTimeout(getRedisClient().del(this.k(key)));
    } catch {
      /* best effort */
    }
  }
}
