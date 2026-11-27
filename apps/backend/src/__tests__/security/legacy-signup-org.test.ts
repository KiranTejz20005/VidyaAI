import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { findUniqueUser, createUser, redisStore } = vi.hoisted(() => {
  const findUniqueUser = vi.fn().mockResolvedValue(null);
  const createUser = vi.fn();
  const redisStore = new Map<string, string>();
  return { findUniqueUser, createUser, redisStore };
});

vi.mock('argon2', () => {
  const hash = vi.fn().mockResolvedValue('argon-hash');
  return { hash, default: { hash } };
});

vi.mock('jsonwebtoken', () => {
  const sign = vi.fn(() => 'signed-access-token');
  return { sign, default: { sign } };
});

vi.mock('../../config/prisma', () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueUser(...args),
      create: (...args: unknown[]) => createUser(...args),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        organization: { create: vi.fn().mockResolvedValue({ id: 'org-personal' }) },
        user: { create: (...args: unknown[]) => createUser(...args) },
      }),
    loginHistory: { create: vi.fn().mockResolvedValue({}) },
    session: { create: vi.fn().mockResolvedValue({ id: 'sess-1' }) },
    refreshToken: { create: vi.fn().mockResolvedValue({ id: 'rt-1' }) },
  },
}));

vi.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    get: async (k: string) => (redisStore.has(k) ? redisStore.get(k)! : null),
    set: async (k: string, v: string) => {
      redisStore.set(k, v);
      return 'OK';
    },
    del: async () => 1,
    incr: async (k: string) => {
      const n = (redisStore.has(k) ? parseInt(redisStore.get(k)!, 10) : 0) + 1;
      redisStore.set(k, String(n));
      return n;
    },
    expire: async () => 1,
  }),
}));

vi.mock('../../services/audit.service', () => ({
  AuditService: { logAuditEvent: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../utils/logger', () => {
  const noop = () => undefined;
  return { logger: { error: noop, warn: noop, info: noop, debug: noop } };
});

import authRouter from '../../api/auth/routes';

const VALID_PASSWORD = 'SecurePass1';

describe('POST /auth signup — organizationId from body is never persisted', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    findUniqueUser.mockResolvedValue(null);
    createUser.mockResolvedValue({
      id: 'new-user',
      email: 'teacher@example.com',
      role: 'TEACHER',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationId: null,
      forcePasswordReset: false,
      hasCompletedOnboarding: false,
      emailVerified: false,
    });
    app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
  });

  it('ignores client-supplied organizationId on self-service signup', async () => {
    const res = await request(app).post('/auth/signup').send({
      email: 'teacher@example.com',
      password: VALID_PASSWORD,
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationId: 'attacker-org-id',
    });

    expect(res.status).toBeLessThan(500);
    expect(createUser).toHaveBeenCalled();
    const arg = createUser.mock.calls[0][0] as { data?: Record<string, unknown> } & Record<string, unknown>;
    const data = (arg.data ?? arg) as Record<string, unknown>;
    // Must never persist the client-supplied tenant id (null/undefined/omitted are all safe)
    expect(data.organizationId).not.toBe('attacker-org-id');
    expect(data.activeOrganizationId).not.toBe('attacker-org-id');
  });
});

