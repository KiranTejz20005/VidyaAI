import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../services/auth.service', () => ({ verifyAccessToken: vi.fn() }));
vi.mock('../../config/prisma', () => ({
  default: { user: { findUnique: vi.fn() }, assessment: { findFirst: vi.fn() } },
}));
vi.mock('../../controllers/admin.controller', () => ({
  AdminController: new Proxy({}, { get: () => vi.fn() }),
}));
vi.mock('../../middlewares/upload.middleware', () => ({ uploadMiddleware: { single: () => vi.fn() } }));
vi.mock('../../security/access-control', () => ({ requirePermission: () => vi.fn() }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import prisma from '../../config/prisma';
import { verifyAccessToken } from '../../services/auth.service';
import { authenticate, authorize, requireOwnership } from '../../middlewares/auth.middleware';
import { csrfProtection } from '../../middlewares/csrf.middleware';
import { exportAssessmentPdf } from '../../controllers/export.controller';
import { hasPermission } from '../../security/roles';
import { PERMISSIONS } from '../../security/permissions';
import adminRouter from '../../routes/admin.routes';
import {
  getQuizHistory,
  getQuizSessionById,
  updateQuizSession,
  clearQuizHistory,
} from '../../controllers/generation.controller';
import { isActiveUserStatus } from '../../security/account-status';

function mockRes() {
  const res: any = { statusCode: 200, json: vi.fn(), cookie: vi.fn() };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  return res as Response & { statusCode: number };
}

describe('authenticate - live account check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: 'u1',
      email: 'a@b.c',
      role: 'SUPER_ADMIN',
      organizationId: 'org-x',
      activeOrganizationId: 'org-x',
    } as any);
  });
  const req = () =>
    ({ headers: { authorization: 'Bearer t' }, cookies: {}, originalUrl: '/api/v1/x' }) as unknown as Request;

  it('rejects deleted users', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    const res = mockRes();
    const next = vi.fn();
    await authenticate(req(), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects non-ACTIVE users', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', role: 'TEACHER', status: 'SUSPENDED', organizationId: 'o',
    } as any);
    const res = mockRes();
    const next = vi.fn();
    await authenticate(req(), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses DB role and org instead of stale claims', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', role: 'STUDENT', status: 'ACTIVE', organizationId: 'org-db',
    } as any);
    const r = req();
    const next = vi.fn();
    await authenticate(r, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(r.user?.role).toBe('STUDENT');
    expect(r.user?.organizationId).toBe('org-db');
    expect(r.user?.activeOrganizationId).toBe('org-db');
  });
});

describe('role normalization', () => {
  const run = (mw: any, role: string) => {
    const next = vi.fn();
    const res = mockRes();
    mw({ user: { id: 'u', role } } as Request, res, next);
    return { next, res };
  };
  it('authorize treats ORG_ADMIN as ADMIN and FACULTY as TEACHER', () => {
    expect(run(authorize(['ADMIN']), 'org_admin').next).toHaveBeenCalled();
    expect(run(authorize(['TEACHER']), 'FACULTY').next).toHaveBeenCalled();
    expect(run(authorize(['SUPER_ADMIN']), 'ADMIN').res.statusCode).toBe(403);
  });
  it('requireOwnership skips ORG_ADMIN but marks FACULTY', () => {
    const a: any = { user: { id: 'u', role: 'ORG_ADMIN' } };
    requireOwnership('x')(a, mockRes(), vi.fn());
    expect(a.authScope).toBeUndefined();
    const f: any = { user: { id: 'u', role: 'FACULTY' } };
    requireOwnership('x')(f, mockRes(), vi.fn());
    expect(f.authScope?.requireOwnership).toBe(true);
  });
  it('hasPermission normalizes case and aliases', () => {
    expect(hasPermission('org_admin', PERMISSIONS.MANAGE_USERS)).toBe(true);
    expect(hasPermission('faculty', PERMISSIONS.GRADE_ASSESSMENT)).toBe(true);
  });
});

describe('export IDOR', () => {
  const call = async (user: any) => {
    const res = mockRes();
    await exportAssessmentPdf({ params: { assessmentId: 'a1' }, user } as any, res);
    return res;
  };
  beforeEach(() => vi.mocked(prisma.assessment.findFirst).mockReset());

  it('scopes teachers by organization and author; 404 when out of scope', async () => {
    vi.mocked(prisma.assessment.findFirst).mockResolvedValue(null as any);
    const res = await call({ id: 't1', role: 'TEACHER', organizationId: 'org-a' });
    expect(res.statusCode).toBe(404);
    expect(vi.mocked(prisma.assessment.findFirst).mock.calls[0][0]!.where).toMatchObject({
      id: 'a1',
      organizationId: 'org-a',
      authorId: 't1',
    });
  });
  it('scopes admins by organization only', async () => {
    vi.mocked(prisma.assessment.findFirst).mockResolvedValue({ id: 'a1' } as any);
    await call({ id: 'ad', role: 'ADMIN', organizationId: 'org-a' });
    const where: any = vi.mocked(prisma.assessment.findFirst).mock.calls[0][0]!.where;
    expect(where.organizationId).toBe('org-a');
    expect(where.authorId).toBeUndefined();
  });
});

describe('csrfProtection exemptions', () => {
  const mk = (over: any) =>
    ({ method: 'POST', headers: {}, cookies: {}, originalUrl: '/api/v1/x', path: '/x', ...over }) as unknown as Request;
  it('skips webhooks', () => {
    const next = vi.fn();
    csrfProtection(mk({ originalUrl: '/api/webhook/stripe' }), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
  it('skips pure Bearer requests', () => {
    const next = vi.fn();
    csrfProtection(mk({ headers: { authorization: 'Bearer abc' } }), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
  it('still enforces CSRF when the access_token cookie is present', () => {
    const next = vi.fn();
    const res = mockRes();
    csrfProtection(mk({ headers: { authorization: 'Bearer abc' }, cookies: { access_token: 'x' } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
  it('still enforces CSRF for cookie-only unsafe requests', () => {
    const res = mockRes();
    csrfProtection(mk({}), res, vi.fn());
    expect(res.statusCode).toBe(403);
  });
});


describe('authenticate - failure and org handling', () => {
  const req = () =>
    ({ headers: { authorization: 'Bearer t' }, cookies: {}, originalUrl: '/api/v1/x' }) as unknown as Request;
  const claims = (over: any = {}) =>
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: 'u1', email: 'a@b.c', role: 'TEACHER', organizationId: 'org-x', activeOrganizationId: 'org-x', ...over,
    } as any);
  beforeEach(() => vi.clearAllMocks());

  it('returns 503 when the DB lookup fails', async () => {
    claims();
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('db down'));
    const res = mockRes();
    const next = vi.fn();
    await authenticate(req(), res, next);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('non-SUPER_ADMIN with a mismatched token org uses the DB org', async () => {
    claims({ activeOrganizationId: 'org-evil' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', role: 'TEACHER', status: 'ACTIVE', organizationId: 'org-db',
    } as any);
    const r = req();
    await authenticate(r, mockRes(), vi.fn());
    expect(r.user?.activeOrganizationId).toBe('org-db');
  });

  it('SUPER_ADMIN keeps the token activeOrganizationId', async () => {
    claims({ role: 'SUPER_ADMIN', activeOrganizationId: 'org-picked' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', role: 'SUPER_ADMIN', status: 'ACTIVE', organizationId: 'org-home',
    } as any);
    const r = req();
    await authenticate(r, mockRes(), vi.fn());
    expect(r.user?.activeOrganizationId).toBe('org-picked');
  });

  it('accepts status case-insensitively via the shared helper', async () => {
    expect(isActiveUserStatus('active')).toBe(true);
    expect(isActiveUserStatus(' ACTIVE ')).toBe(true);
    expect(isActiveUserStatus('SUSPENDED')).toBe(false);
    expect(isActiveUserStatus(undefined)).toBe(false);
  });
});

describe('/roles routes', () => {
  it('reject ADMIN but allow SUPER_ADMIN', () => {
    const layers = (adminRouter as any).stack.filter((l: any) => l.route && l.route.path.startsWith('/roles'));
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      const guard = layer.route.stack[0].handle;
      const denied = mockRes();
      const deniedNext = vi.fn();
      guard({ user: { id: 'a', role: 'ADMIN' } }, denied, deniedNext);
      expect(denied.statusCode).toBe(403);
      expect(deniedNext).not.toHaveBeenCalled();
      const allowedNext = vi.fn();
      guard({ user: { id: 's', role: 'SUPER_ADMIN' } }, mockRes(), allowedNext);
      expect(allowedNext).toHaveBeenCalled();
    }
  });
});

describe('generation handlers without a user', () => {
  it.each([
    ['getQuizHistory', getQuizHistory],
    ['getQuizSessionById', getQuizSessionById],
    ['updateQuizSession', updateQuizSession],
    ['clearQuizHistory', clearQuizHistory],
  ])('%s returns 401', async (_n, handler) => {
    const res = mockRes();
    await handler({ params: { id: 's1' }, query: {}, body: {} } as any, res);
    expect(res.statusCode).toBe(401);
  });
});
