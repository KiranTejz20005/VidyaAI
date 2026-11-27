import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/auth.service', () => ({ verifyAccessToken: vi.fn() }));
vi.mock('../../config/prisma', () => ({ default: { user: { findUnique: vi.fn() } } }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { verifyAccessToken } from '../../services/auth.service';
import prisma from '../../config/prisma';
import { authenticate, authorize, requireOrganizationScope } from '../../middlewares/auth.middleware';
import { orgScope, getRequestOrgId } from '../../security/request-context';
import { tenantScope } from '../../security/tenant-scope';
import { actorFromRequest } from '../../services/admin/admin-scope';

const ORG = '11111111-1111-1111-1111-111111111111';

function makeApp() {
  const app = express();
  app.use(authenticate);
  app.get('/scope', (req, res) =>
    res.json({ scope: orgScope(req), tenant: tenantScope(req), orgId: getRequestOrgId(req) ?? null, role: req.user?.role }),
  );
  app.get('/admin/users', authorize(['ADMIN', 'SUPER_ADMIN']), requireOrganizationScope(), (req, res) =>
    res.json({ actor: actorFromRequest(req) }),
  );
  app.get('/admin/actor', authorize(['ADMIN', 'SUPER_ADMIN']), (req, res) => res.json({ actor: actorFromRequest(req) }));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode ?? 500).json({ code: err.code }));
  return app;
}

function mockUser(db: { role: string; status?: string; organizationId?: string | null }, token: Record<string, unknown> = {}) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'u1',
    role: db.role,
    status: db.status ?? 'ACTIVE',
    organizationId: db.organizationId ?? null,
    forcePasswordReset: false,
  } as any);
  vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'u1', email: 'a@b.c', role: db.role, ...token } as any);
}

const get = (path: string) => request(makeApp()).get(path).set('Authorization', 'Bearer t');

beforeEach(() => vi.clearAllMocks());

describe('real authenticate + org scoping', () => {
  it('SUPER_ADMIN without an organization is platform-wide (orgScope {})', async () => {
    mockUser({ role: 'SUPER_ADMIN', organizationId: null });
    const res = await get('/scope').expect(200);
    expect(res.body.scope).toEqual({});
    expect(res.body.tenant).toEqual({});
    expect(res.body.orgId).toBeNull();
  });

  it('SUPER_ADMIN who selected an organization is confined to it', async () => {
    mockUser({ role: 'SUPER_ADMIN', organizationId: null }, { activeOrganizationId: ORG });
    const res = await get('/scope').expect(200);
    expect(res.body.scope).toEqual({ organizationId: ORG });
  });

  it('non-super user without an organization fails closed (403) on orgScope', async () => {
    mockUser({ role: 'TEACHER', organizationId: null });
    const res = await get('/scope').expect(403);
    expect(res.body.code).toBe('ORG_SCOPE_REQUIRED');
  });

  it('ADMIN with null org gets 403 on org-scoped admin endpoints', async () => {
    mockUser({ role: 'ADMIN', organizationId: null });
    await get('/admin/users').expect(403);
    const res = await get('/admin/actor').expect(403);
    expect(res.body.code).toBe('ORG_SCOPE_REQUIRED');
  });

  it('ADMIN with an org passes and is scoped to it', async () => {
    mockUser({ role: 'ADMIN', organizationId: ORG });
    const res = await get('/admin/actor').expect(200);
    expect(res.body.actor.organizationId).toBe(ORG);
  });

  it('suspended user is rejected with 401', async () => {
    mockUser({ role: 'ADMIN', status: 'SUSPENDED', organizationId: ORG });
    await get('/scope').expect(401);
  });

  it('missing DB user is rejected with 401', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'gone', email: 'a@b.c', role: 'ADMIN' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await get('/scope').expect(401);
  });

  it('DB role wins over a stale (elevated) token role', async () => {
    mockUser({ role: 'STUDENT', organizationId: ORG }, { role: 'SUPER_ADMIN', organizationId: null });
    const res = await get('/scope').expect(200);
    expect(res.body.role).toBe('STUDENT');
    expect(res.body.scope).toEqual({ organizationId: ORG });
    await get('/admin/actor').expect(403);
  });

  it('non-super token cannot select another organization', async () => {
    mockUser({ role: 'TEACHER', organizationId: ORG }, { activeOrganizationId: '22222222-2222-2222-2222-222222222222' });
    const res = await get('/scope').expect(200);
    expect(res.body.scope).toEqual({ organizationId: ORG });
  });
});
