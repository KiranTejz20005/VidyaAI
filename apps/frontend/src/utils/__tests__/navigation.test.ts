import { getDashboardRoute, validateRouteAccess } from '../navigation';
import { UserRole, ROUTES } from '../../config/routes';
import { vi } from 'vitest';

describe('Navigation Utils', () => {
  describe('getDashboardRoute', () => {
    it('returns SUPER_ADMIN dashboard route', () => {
      expect(getDashboardRoute(UserRole.SUPER_ADMIN)).toBe(ROUTES.SUPER_ADMIN.DASHBOARD);
    });

    it('returns ORG_ADMIN dashboard route for ADMIN', () => {
      expect(getDashboardRoute(UserRole.ADMIN)).toBe(ROUTES.ORG_ADMIN.DASHBOARD);
    });

    it('returns ORG_ADMIN dashboard route for ORG_ADMIN', () => {
      expect(getDashboardRoute(UserRole.ORG_ADMIN)).toBe(ROUTES.ORG_ADMIN.DASHBOARD);
    });

    it('returns FACULTY dashboard route', () => {
      expect(getDashboardRoute(UserRole.FACULTY)).toBe(ROUTES.FACULTY.DASHBOARD);
    });

    it('returns TEACHER dashboard route', () => {
      expect(getDashboardRoute(UserRole.TEACHER)).toBe(ROUTES.TEACHER.DASHBOARD);
    });

    it('returns STUDENT dashboard route for STUDENT or unknown roles', () => {
      expect(getDashboardRoute(UserRole.STUDENT)).toBe(ROUTES.STUDENT.DASHBOARD);
      expect(getDashboardRoute('UNKNOWN')).toBe(ROUTES.STUDENT.DASHBOARD);
      expect(getDashboardRoute(undefined as any)).toBe(ROUTES.STUDENT.DASHBOARD);
    });
  });

  describe('validateRouteAccess', () => {
    const originalEnv = process.env.NODE_ENV;
    let consoleErrorSpy: any;

    beforeAll(() => {
      (process.env as any).NODE_ENV = 'development';
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(() => {
      (process.env as any).NODE_ENV = originalEnv;
      consoleErrorSpy.mockRestore();
    });

    afterEach(() => {
      consoleErrorSpy.mockClear();
    });

    it('should log an error if SUPER_ADMIN accesses ORG_ADMIN dashboard', () => {
      validateRouteAccess(UserRole.SUPER_ADMIN, ROUTES.ORG_ADMIN.DASHBOARD);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[Navigation Error] Super Admin should not access the Organization Admin dashboard (${ROUTES.ORG_ADMIN.DASHBOARD}).`
      );
    });

    it('should log an error if ADMIN accesses SUPER_ADMIN dashboard', () => {
      validateRouteAccess(UserRole.ADMIN, ROUTES.SUPER_ADMIN.DASHBOARD);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[Navigation Error] Organization Admin should not access the Super Admin dashboard (${ROUTES.SUPER_ADMIN.DASHBOARD}).`
      );
    });

    it('should log an error if ORG_ADMIN accesses SUPER_ADMIN dashboard', () => {
      validateRouteAccess(UserRole.ORG_ADMIN, ROUTES.SUPER_ADMIN.DASHBOARD);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[Navigation Error] Organization Admin should not access the Super Admin dashboard (${ROUTES.SUPER_ADMIN.DASHBOARD}).`
      );
    });

    it('should not log an error for valid routes', () => {
      validateRouteAccess(UserRole.SUPER_ADMIN, ROUTES.SUPER_ADMIN.DASHBOARD);
      validateRouteAccess(UserRole.ORG_ADMIN, ROUTES.ORG_ADMIN.DASHBOARD);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});

import { isOnboarded, normalizeRole } from '../navigation';

describe('isOnboarded / normalizeRole', () => {
  it('exempts admins and honors flags', () => {
    expect(isOnboarded(null)).toBe(false);
    expect(isOnboarded({ role: 'ADMIN' })).toBe(true);
    expect(isOnboarded({ role: 'STUDENT' })).toBe(false);
    expect(isOnboarded({ role: 'STUDENT', hasCompletedOnboarding: true })).toBe(true);
    expect(isOnboarded({ role: 'TEACHER', organizationId: 'o', departmentId: 'd' })).toBe(true);
  });
  it('normalizes aliases', () => {
    expect(normalizeRole('org_admin')).toBe('ADMIN');
    expect(normalizeRole('faculty')).toBe('TEACHER');
  });
});
