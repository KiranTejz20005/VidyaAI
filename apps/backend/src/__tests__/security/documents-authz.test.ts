import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/documents/controller', () => ({
  uploadDocument: vi.fn(), parseDocument: vi.fn(), listDocuments: vi.fn(), getDocument: vi.fn(),
  deleteDocument: vi.fn(), processDocument: vi.fn(), checkDocumentJob: vi.fn(),
}));
vi.mock('../../middlewares/upload.middleware', () => ({ uploadMiddleware: { single: () => vi.fn() } }));
vi.mock('../../middlewares/rate-limit.middleware', () => ({ uploadRateLimiter: vi.fn() }));
vi.mock('../../middlewares/validate.middleware', () => ({ validate: () => vi.fn() }));
vi.mock('../../middlewares/auth.middleware', async () => {
  const actual = await vi.importActual<any>('../../middlewares/auth.middleware');
  return { ...actual, authenticate: vi.fn() };
});
vi.mock('../../config/prisma', () => ({ default: {} }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import router from '../../api/documents/routes';

const call = (guard: any, role: string) => {
  const res: any = { statusCode: 200, json: vi.fn() };
  res.status = (c: number) => ((res.statusCode = c), res);
  const next = vi.fn();
  guard({ user: { id: 'u', role } }, res, next);
  return { res, next };
};

describe('document mutation routes', () => {
  const routes = (router as any).stack.filter(
    (l: any) => l.route && (l.route.methods.post || l.route.methods.delete),
  );
  it('exclude STUDENT but allow TEACHER and ADMIN', () => {
    expect(routes.length).toBeGreaterThan(0);
    for (const l of routes) {
      // staffOnly is the first route-level handler on every mutation route
      const first = l.route.stack[0].handle;
      expect(call(first, 'STUDENT').res.statusCode).toBe(403);
      expect(call(first, 'TEACHER').next).toHaveBeenCalled();
      expect(call(first, 'ADMIN').next).toHaveBeenCalled();
    }
  });
});
