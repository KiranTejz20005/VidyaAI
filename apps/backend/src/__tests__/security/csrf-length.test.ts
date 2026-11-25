import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { csrfProtection } from '../../middlewares/csrf.middleware';

function mockRes(): Response {
  const res = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json: vi.fn(),
    cookie: vi.fn(),
  };
  return res as unknown as Response;
}

describe('csrfProtection — token length mismatch', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('returns 403 and does not call next when header token length differs from cookie', () => {
    const cookieToken = 'a'.repeat(64);
    const headerToken = 'short';

    const req = {
      method: 'POST',
      path: '/api/test',
      ip: '127.0.0.1',
      cookies: { 'XSRF-TOKEN': cookieToken },
      headers: { 'x-csrf-token': headerToken },
    } as unknown as Request;
    const res = mockRes();

    csrfProtection(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'CSRF token mismatch' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when lengths match but values differ (timing-safe compare)', () => {
    const token = 'b'.repeat(64);
    const wrong = 'c'.repeat(64);

    const req = {
      method: 'PUT',
      path: '/api/resource',
      ip: '10.0.0.1',
      cookies: { 'XSRF-TOKEN': token },
      headers: { 'x-csrf-token': wrong },
    } as unknown as Request;
    const res = mockRes();

    csrfProtection(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when cookie and header tokens match', () => {
    const token = cryptoRandomHex(64);

    const req = {
      method: 'POST',
      path: '/api/safe',
      ip: '127.0.0.1',
      cookies: { 'XSRF-TOKEN': token },
      headers: { 'x-csrf-token': token },
    } as unknown as Request;
    const res = mockRes();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/** 64-char hex string (same shape csrf middleware emits). */
function cryptoRandomHex(charLen: number): string {
  return 'f'.repeat(charLen);
}