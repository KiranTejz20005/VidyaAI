import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../services/auth.service', () => ({
  verifyAccessToken: vi.fn(),
}));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { verifyAccessToken } from '../../services/auth.service';
import { authenticate } from '../../middlewares/auth.middleware';

function mockRes(): Response {
  const res = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json: vi.fn(),
  };
  return res as unknown as Response;
}

describe('authenticate — forcePasswordReset (JWT pwr)', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: 'u-pwr',
      email: 'temp@school.edu',
      role: 'TEACHER',
      organizationId: null,
      activeOrganizationId: null,
      departmentId: null,
      forcePasswordReset: true,
    });
  });

  it('returns 403 PASSWORD_RESET_REQUIRED on non-allowed paths', () => {
    const req = {
      headers: { authorization: 'Bearer valid.jwt' },
      cookies: {},
      originalUrl: '/api/v1/assignments',
    } as unknown as Request;
    const res = mockRes();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You must set a new password before continuing',
      code: 'PASSWORD_RESET_REQUIRED',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows password change endpoint while reset is required', () => {
    const req = {
      headers: { authorization: 'Bearer valid.jwt' },
      cookies: {},
      originalUrl: '/api/v1/auth/me/password',
    } as unknown as Request;
    const res = mockRes();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
    expect(req.user?.id).toBe('u-pwr');
  });

  it('does not block when forcePasswordReset is false', () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: 'u-normal',
      email: 'ok@school.edu',
      role: 'STUDENT',
      organizationId: 'org-1',
      forcePasswordReset: false,
    });

    const req = {
      headers: { authorization: 'Bearer valid.jwt' },
      cookies: {},
      originalUrl: '/api/v1/dashboard',
    } as unknown as Request;
    const res = mockRes();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});