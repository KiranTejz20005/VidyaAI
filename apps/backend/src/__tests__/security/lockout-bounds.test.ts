import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ redis: null as any }));
vi.mock('../../config/redis', () => ({ getRedisClient: () => h.redis }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { MemoryCounters, MemoryLocks, atomicIncr, ATOMIC_INCR_SCRIPT } from '../../api/auth/resilient-store';
import { recordFailedLogin, LOGIN_MAX_ATTEMPTS_PER_IP, LOGIN_LOCK_SECONDS } from '../../api/auth/lockout';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('MemoryCounters bounds', () => {
  it('evicts oldest entries beyond the hard cap', () => {
    const c = new MemoryCounters(3);
    ['a', 'b', 'c', 'd', 'e'].forEach((k) => c.hit(k, 60_000));
    expect(c.size).toBe(3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBeUndefined();
    expect(c.get('e')?.n).toBe(1);
  });

  it('expires windows and sweeps expired entries periodically', () => {
    const c = new MemoryCounters(100, 1000);
    c.hit('old', 500);
    vi.advanceTimersByTime(2000);
    expect(c.get('old')).toBeUndefined();
    c.hit('new', 60_000); // triggers the throttled sweep
    expect(c.size).toBe(1);
  });

  it('counts within a window and restarts after it', () => {
    const c = new MemoryCounters();
    expect(c.hit('k', 1000).n).toBe(1);
    expect(c.hit('k', 1000).n).toBe(2);
    vi.advanceTimersByTime(1001);
    expect(c.hit('k', 1000).n).toBe(1);
  });
});

describe('MemoryLocks bounds', () => {
  it('caps size, evicting oldest first, and honours TTL', () => {
    const l = new MemoryLocks(2);
    l.lock('a', 1000);
    l.lock('b', 1000);
    l.lock('c', 1000);
    expect(l.size).toBe(2);
    expect(l.isLocked('a')).toBe(false);
    expect(l.isLocked('c')).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(l.isLocked('c')).toBe(false);
  });
});

describe('atomic Redis counter', () => {
  it('uses a single EVAL that always sets a TTL on first increment', async () => {
    vi.useRealTimers();
    expect(ATOMIC_INCR_SCRIPT).toContain('INCR');
    expect(ATOMIC_INCR_SCRIPT).toContain('PEXPIRE');
    const evalFn = vi.fn().mockResolvedValue([1, 900_000]);
    const out = await atomicIncr({ eval: evalFn }, 'k', 900_000);
    expect(out).toEqual({ count: 1, ttlMs: 900_000 });
    expect(evalFn).toHaveBeenCalledWith(ATOMIC_INCR_SCRIPT, 1, 'k', '900000');
  });

  // Module: api/auth/lockout recordFailedLogin. Existing: this file.
  // Phase 3 atomic 2-key Lua — lock via eval, not redis.set. User: implement Phase 3.
  it('recordFailedLogin never issues a bare INCR/EXPIRE pair and locks at the threshold', async () => {
    vi.useRealTimers();
    const store = new Map<string, number>();
    const locks = new Set<string>();
    h.redis = {
      eval: vi.fn(async (_s: string, nKeys: number, ...args: any[]) => {
        const counterKey = args[0] as string;
        const lockKey = nKeys >= 2 ? (args[1] as string) : '';
        const max = nKeys >= 2 ? Number(args[3]) : Infinity;
        const n = (store.get(counterKey) ?? 0) + 1;
        store.set(counterKey, n);
        if (n >= max && lockKey) {
          locks.add(lockKey);
          store.delete(counterKey);
          return [n, 1];
        }
        return [n, LOGIN_LOCK_SECONDS * 1000];
      }),
      incr: vi.fn(),
      expire: vi.fn(),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async (k: string) => {
        store.delete(k);
        return 1;
      }),
    };
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS_PER_IP; i++) await recordFailedLogin('x@y.z', '1.1.1.1');
    expect(h.redis.incr).not.toHaveBeenCalled();
    expect(h.redis.expire).not.toHaveBeenCalled();
    expect(locks.has('login:locked:x@y.z:1.1.1.1')).toBe(true);
  });
});
