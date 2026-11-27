import { describe, it, expect } from 'vitest';
import { canAccessRoute } from '../route-permissions';

describe('canAccessRoute', () => {
  it('lets SUPER_ADMIN reach everything', () => {
    expect(canAccessRoute('SUPER_ADMIN', '/dashboard/superadmin')).toBe(true);
    expect(canAccessRoute('SUPER_ADMIN', '/admin/users')).toBe(true);
  });

  it('keeps the legacy SaaS control plane away from other roles', () => {
    for (const role of ['ADMIN', 'ORG_ADMIN', 'TEACHER', 'FACULTY', 'STUDENT']) {
      expect(canAccessRoute(role, '/dashboard/superadmin')).toBe(false);
      expect(canAccessRoute(role, '/super-admin/users')).toBe(false);
    }
  });

  it('scopes /dashboard/supervisor (legacy /dashboard/admin is redirected by next.config)', () => {
    expect(canAccessRoute('STUDENT', '/dashboard/supervisor')).toBe(false);
    expect(canAccessRoute('TEACHER', '/dashboard/supervisor')).toBe(true);
  });

  it('applies role aliases and canonical trees', () => {
    expect(canAccessRoute('FACULTY', '/teacher/assessments')).toBe(true);
    expect(canAccessRoute('ORG_ADMIN', '/admin/users')).toBe(true);
    expect(canAccessRoute('STUDENT', '/student/practice')).toBe(true);
    expect(canAccessRoute('STUDENT', '/teacher')).toBe(false);
    expect(canAccessRoute('TEACHER', '/admin')).toBe(false);
    expect(canAccessRoute('STUDENT', '/dashboard/parent')).toBe(true);
    expect(canAccessRoute('', '/student')).toBe(false);
  });
});
