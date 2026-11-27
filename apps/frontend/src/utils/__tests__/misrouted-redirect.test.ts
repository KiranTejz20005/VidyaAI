import { describe, it, expect } from 'vitest';
import { getMisroutedRedirect, getDashboardRoute } from '../navigation';

describe('getMisroutedRedirect (no /dashboard <-> role-root loop)', () => {
  it('sends other known roles to their own home from /student', () => {
    expect(getMisroutedRedirect('TEACHER', '/student')).toBe('/teacher');
    expect(getMisroutedRedirect('ADMIN', '/student')).toBe('/admin');
    expect(getMisroutedRedirect('SUPER_ADMIN', '/student')).toBe('/super-admin');
  });
  it('returns null for unknown role, null user, or when already home', () => {
    expect(getMisroutedRedirect('PARENT', '/student')).toBeNull();
    expect(getMisroutedRedirect(null, '/student')).toBeNull();
    expect(getMisroutedRedirect(undefined, '/student')).toBeNull();
    expect(getMisroutedRedirect('STUDENT', '/student')).toBeNull();
  });
  it('never targets /dashboard, so it cannot bounce back', () => {
    for (const r of ['SUPER_ADMIN', 'ADMIN', 'ORG_ADMIN', 'FACULTY', 'TEACHER', 'STUDENT', 'X']) {
      expect(getDashboardRoute(r)).not.toBe('/dashboard');
    }
  });
});
