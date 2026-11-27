import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  const state = { redisDown: false, store: new Map<string, string>() };
  const userFindUnique = vi.fn();
  const userUpdate = vi.fn();
  const userCreateTx = vi.fn();
  const userCreateTop = vi.fn();
  const orgCreateTx = vi.fn();
  const orgFindMany = vi.fn();
  const revokeAll = vi.fn();
  const verifyGoogle = vi.fn();
  return { state, userFindUnique, userUpdate, userCreateTx, userCreateTop, orgCreateTx, orgFindMany, revokeAll, verifyGoogle };
});

vi.mock('argon2', () => {
  const hash = vi.fn().mockResolvedValue('argon-hash');
  const verify = vi.fn().mockResolvedValue(false);
  return { hash, verify, default: { hash, verify } };
});
vi.mock('jsonwebtoken', () => {
  const sign = vi.fn(() => 'signed-access-token');
  return { sign, verify: vi.fn(), default: { sign, verify: vi.fn() } };
});
vi.mock('../../config/prisma', () => ({
  default: {
    user: {
      findUnique: (...a: unknown[]) => h.userFindUnique(...a),
      update: (...a: unknown[]) => h.userUpdate(...a),
      create: (...a: unknown[]) => h.userCreateTop(...a),
    },
    organization: { findMany: (...a: unknown[]) => h.orgFindMany(...a), findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    loginHistory: { create: vi.fn().mockResolvedValue({}) },
    session: { create: vi.fn().mockResolvedValue({ id: 'sess-1' }), updateMany: vi.fn().mockResolvedValue({}) },
    refreshToken: { create: vi.fn().mockResolvedValue({ id: 'rt-1' }), updateMany: vi.fn().mockResolvedValue({}) },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        organization: { create: (...a: unknown[]) => h.orgCreateTx(...a) },
        user: { create: (...a: unknown[]) => h.userCreateTx(...a), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }),
  },
}));
vi.mock('../../config/redis', () => ({
  getRedisClient: () => {
    if (h.state.redisDown) throw new Error('redis down');
    return {
      get: async (k: string) => h.state.store.get(k) ?? null,
      set: async (k: string, v: string) => (h.state.store.set(k, v), 'OK'),
      del: async () => 1,
      incr: async (k: string) => {
        const n = parseInt(h.state.store.get(k) ?? '0', 10) + 1;
        h.state.store.set(k, String(n));
        return n;
      },
      eval: async (_script: string, _n: number, k: string) => {
        const n = parseInt(h.state.store.get(k) ?? '0', 10) + 1;
        h.state.store.set(k, String(n));
        return [n, 60_000];
      },
      expire: async () => 1,
      pexpire: async () => 1,
      pttl: async () => 60_000,
      decr: async () => 0,
    };
  },
}));
vi.mock('../../services/audit.service', () => ({ AuditService: { logAuditEvent: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../../services/invitation.service', () => ({ validateInvitationToken: vi.fn() }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../services/google-identity.service', () => ({
  GoogleIdentityError: class extends Error {
    statusCode = 401;
  },
  verifyGoogleToken: (...a: unknown[]) => h.verifyGoogle(...a),
}));
// Header-driven stand-in for authenticate; the real authorize() is used.
vi.mock('../../middlewares/auth.middleware', async () => {
  const actual = await vi.importActual<typeof import('../../middlewares/auth.middleware')>('../../middlewares/auth.middleware');
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const role = req.headers['x-test-role'];
      if (!role) return res.status(401).json({ success: false });
      req.user = { id: 'u-actor', role, organizationId: 'org-own', activeOrganizationId: 'org-own' };
      next();
    },
  };
});

import authRouter from '../../api/auth/routes';
import { ResilientRedisStore } from '../../api/auth/resilient-store';
import { ensurePersonalOrganization } from '../../services/auth.service';

const PASSWORD = 'SecurePass1';
const signupBody = { email: 'new@example.com', password: PASSWORD, firstName: 'Ada', lastName: 'L' };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.redisDown = false;
  h.state.store.clear();
  h.userFindUnique.mockResolvedValue(null);
  h.orgCreateTx.mockResolvedValue({ id: 'org-personal' });
  h.userCreateTx.mockImplementation(async ({ data }: any) => ({
    id: data.id, email: data.email, role: data.role, firstName: 'Ada', lastName: 'L',
    organizationId: data.organizationId, activeOrganizationId: data.activeOrganizationId,
    forcePasswordReset: false, hasCompletedOnboarding: false,
  }));
});

describe('signup: role/org cannot be set from the client', () => {
  it('coerces privileged roles to a self-service role and never attaches an existing org', async () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN', 'FACULTY']) {
      const res = await request(makeApp()).post('/auth/signup').send({ ...signupBody, role, organizationId: 'victim-org', orgCode: 'ABC' });
      // Zod's enum rejects non-self-service roles outright.
      expect(res.status).toBe(400);
    }
    expect(h.userCreateTx).not.toHaveBeenCalled();

    const ok = await request(makeApp()).post('/auth/signup').send({ ...signupBody, organizationId: 'victim-org', activeOrganizationId: 'victim-org' });
    expect(ok.status).toBe(201);
    const data = h.userCreateTx.mock.calls[0][0].data;
    expect(data.role).toBe('TEACHER');
    expect(data.organizationId).toBe('org-personal');
    expect(data.activeOrganizationId).toBe('org-personal');
    expect(JSON.stringify(data)).not.toContain('victim-org');
  });

  it('creates the user and personal workspace inside one transaction (no bare user.create)', async () => {
    await request(makeApp()).post('/auth/signup').send(signupBody).expect(201);
    expect(h.orgCreateTx).toHaveBeenCalledTimes(1);
    expect(h.userCreateTx).toHaveBeenCalledTimes(1);
    expect(h.userCreateTop).not.toHaveBeenCalled();
    expect(h.orgCreateTx.mock.calls[0][0].data.code).toMatch(/^P[0-9A-F]{10}$/);
  });
});

describe('signup: duplicate handling', () => {
  // Module under test: api/auth/controller signup. Existing: this file.
  // Phase 3 anti-enumeration: 201 without tokens. User: implement Phase 3 plan.
  it('returns the same 201 shape without tokens for an existing email and unique-violation race', async () => {
    h.userFindUnique.mockResolvedValue({ id: 'x' });
    const dup = await request(makeApp()).post('/auth/signup').send(signupBody);
    expect(dup.status).toBe(201);
    expect(dup.body.success).toBe(true);
    expect(dup.body.data?.accessToken ?? null).toBeNull();
    expect(dup.body.data?.user ?? null).toBeNull();

    h.userFindUnique.mockResolvedValue(null);
    const { Prisma } = await import('@prisma/client');
    h.userCreateTx.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const race = await request(makeApp()).post('/auth/signup').send(signupBody);
    expect(race.status).toBe(201);
    expect(race.body.message).toBe(dup.body.message);
    expect(race.body.data?.accessToken ?? null).toBeNull();
  });
});

describe('GET /auth/public-organizations', () => {
  it('exposes no organizations and does not query them', async () => {
    const res = await request(makeApp()).get('/auth/public-organizations').expect(200);
    expect(res.body.data).toEqual([]);
    expect(h.orgFindMany).not.toHaveBeenCalled();
  });

  it('is rate limited', async () => {
    const app = makeApp();
    let last = 200;
    for (let i = 0; i < 35; i++) last = (await request(app).get('/auth/public-organizations')).status;
    expect(last).toBe(429);
  });
});

describe('Google sign-in', () => {
  const identity = { email: 'g@example.com', givenName: 'G', familyName: 'U' };
  beforeEach(() => h.verifyGoogle.mockResolvedValue(identity));

  it('refuses to sign up privileged roles', async () => {
    const res = await request(makeApp()).post('/auth/google').send({ token: 'x'.repeat(30), isSignUp: true, role: 'ADMIN' });
    expect(res.status).toBe(403);
    expect(h.userCreateTx).not.toHaveBeenCalled();
  });

  it('creates self-service accounts with an atomic personal workspace', async () => {
    const res = await request(makeApp()).post('/auth/google').send({ token: 'x'.repeat(30), isSignUp: true, role: 'FACULTY' });
    expect(res.status).toBe(200);
    const data = h.userCreateTx.mock.calls[0][0].data;
    expect(data.role).toBe('TEACHER');
    expect(data.organizationId).toBe('org-personal');
    expect(data.emailVerified).toBe(true);
  });

  it('does not reveal anything for unknown accounts beyond the caller\'s own verified email', async () => {
    const res = await request(makeApp()).post('/auth/google').send({ token: 'x'.repeat(30) });
    expect(res.status).toBe(404);
    expect(h.userCreateTx).not.toHaveBeenCalled();
  });

  it('drops an unverified (possibly pre-registered) password when linking to Google', async () => {
    const existing = {
      id: 'u1', email: identity.email, role: 'TEACHER', status: 'ACTIVE', authProvider: 'LOCAL',
      passwordHash: 'attacker-hash', emailVerified: false, organizationId: 'o1', activeOrganizationId: 'o1', avatar: null,
    };
    h.userFindUnique.mockResolvedValue(existing);
    h.userUpdate.mockImplementation(async ({ data }: any) => ({ ...existing, ...data }));
    const res = await request(makeApp()).post('/auth/google').send({ token: 'x'.repeat(30) });
    expect(res.status).toBe(200);
    const data = h.userUpdate.mock.calls[0][0].data;
    expect(data.passwordHash).toBeNull();
    expect(data.emailVerified).toBe(true);
  });

  it('keeps the password of an already-verified account', async () => {
    const existing = {
      id: 'u1', email: identity.email, role: 'TEACHER', status: 'ACTIVE', authProvider: 'LOCAL',
      passwordHash: 'real-hash', emailVerified: true, organizationId: 'o1', activeOrganizationId: 'o1', avatar: 'a',
    };
    h.userFindUnique.mockResolvedValue(existing);
    h.userUpdate.mockImplementation(async ({ data }: any) => ({ ...existing, ...data }));
    await request(makeApp()).post('/auth/google').send({ token: 'x'.repeat(30) }).expect(200);
    expect(h.userUpdate.mock.calls[0][0].data).not.toHaveProperty('passwordHash');
  });
});

describe('PUT /auth/me/organization (moved from the legacy router)', () => {
  it('requires authentication', async () => {
    await request(makeApp()).put('/auth/me/organization').send({ organizationName: 'X' }).expect(401);
  });

  it.each(['TEACHER', 'STUDENT'])('is forbidden for %s', async (role) => {
    await request(makeApp()).put('/auth/me/organization').set('x-test-role', role).send({ organizationName: 'X' }).expect(403);
  });

  it('validates the body for admins', async () => {
    const res = await request(makeApp())
      .put('/auth/me/organization')
      .set('x-test-role', 'ADMIN')
      .send({ organizationName: 'x'.repeat(500) });
    expect(res.status).toBe(400);
  });

  it('renames only the caller\'s own organization', async () => {
    const orgUpdate = vi.fn().mockResolvedValue({});
    const prisma = (await import('../../config/prisma')).default as any;
    prisma.organization.update = orgUpdate;
    h.userFindUnique.mockResolvedValue({ id: 'u-actor', email: 'a@b.c', role: 'ADMIN', organizationId: 'org-own', activeOrganizationId: 'org-own' });
    const res = await request(makeApp())
      .put('/auth/me/organization')
      .set('x-test-role', 'ADMIN')
      .send({ organizationName: 'New Name', organizationId: 'other-org', id: 'other-org' });
    expect(res.status).toBe(200);
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org-own' }, data: { name: 'New Name' } });
  });
});

describe('login lockout when Redis is unavailable', () => {
  it('still locks the account in memory after repeated failures', async () => {
    h.state.redisDown = true;
    h.userFindUnique.mockResolvedValue(null);
    const app = makeApp();
    const attempt = () => request(app).post('/auth/login').send({ email: 'victim@example.com', password: 'wrong' });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});

describe('ResilientRedisStore', () => {
  it('counts in Redis when available', async () => {
    const store = new ResilientRedisStore('t1');
    store.init({ windowMs: 1000 } as any);
    expect((await store.increment('ip')).totalHits).toBe(1);
    expect((await store.increment('ip')).totalHits).toBe(2);
    expect(h.state.store.get('rl:t1:ip')).toBe('2');
  });

  it('degrades to in-memory counting (not unlimited) when Redis is down', async () => {
    h.state.redisDown = true;
    const store = new ResilientRedisStore('t2');
    store.init({ windowMs: 1000 } as any);
    expect((await store.increment('ip')).totalHits).toBe(1);
    expect((await store.increment('ip')).totalHits).toBe(2);
  });
});

describe('ensurePersonalOrganization', () => {
  it('is a no-op for users that already have an organization or are SUPER_ADMIN', async () => {
    const u = { id: 'u', email: 'a@b.c', role: 'TEACHER', organizationId: 'o', activeOrganizationId: 'o' };
    expect((await ensurePersonalOrganization(u)).created).toBe(false);
    const sa = { ...u, role: 'SUPER_ADMIN', organizationId: null, activeOrganizationId: null };
    expect((await ensurePersonalOrganization(sa)).created).toBe(false);
    expect(h.orgCreateTx).not.toHaveBeenCalled();
  });

  it('provisions an isolated workspace for an org-less user', async () => {
    const u = { id: 'abcdef12-0000-0000-0000-000000000000', email: 'a@b.c', role: 'TEACHER', organizationId: null, activeOrganizationId: null };
    const out = await ensurePersonalOrganization(u);
    expect(out.created).toBe(true);
    expect(out.user.organizationId).toBe('org-personal');
  });
});
