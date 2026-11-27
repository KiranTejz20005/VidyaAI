import { UserRole, ROUTES } from '../config/routes';

/** Collapse role aliases (ORG_ADMIN -> ADMIN, FACULTY -> TEACHER) for permission checks. */
export function normalizeRole(role: string | undefined | null): string {
  let n = (role ?? '').toUpperCase();
  if (n === 'ORG_ADMIN') n = 'ADMIN';
  if (n === 'FACULTY') n = 'TEACHER';
  return n;
}

interface OnboardingUserShape {
  role?: string | null;
  hasCompletedOnboarding?: boolean;
  organizationId?: string | null;
  departmentId?: string | null;
}

/** Single source of truth for "has this user finished (or is exempt from) onboarding". */
export function isOnboarded(user: OnboardingUserShape | null | undefined): boolean {
  if (!user) return false;
  const role = user.role?.toUpperCase();
  if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) return true;
  return user.hasCompletedOnboarding === true || !!(user.organizationId && user.departmentId);
}

export function getDashboardRoute(role: string): string {
  const normalizedRole = role?.toUpperCase();
  switch (normalizedRole) {
    case UserRole.SUPER_ADMIN:
      return ROUTES.SUPER_ADMIN.DASHBOARD;
    case UserRole.ADMIN:
    case UserRole.ORG_ADMIN:
      return ROUTES.ORG_ADMIN.DASHBOARD;
    case UserRole.FACULTY:
      return ROUTES.FACULTY.DASHBOARD;
    case UserRole.TEACHER:
      return ROUTES.TEACHER.DASHBOARD;
    case UserRole.STUDENT:
      return ROUTES.STUDENT.DASHBOARD;
    default:
      return ROUTES.STUDENT.DASHBOARD;
  }
}

const KNOWN_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ORG_ADMIN, UserRole.FACULTY, UserRole.TEACHER, UserRole.STUDENT,
]);

/**
 * Where a role-root layout should send a user who does not belong there.
 * Returns null when there is nowhere better to go (null user, unknown role, or the
 * user's home is the very root they are on) so layouts never bounce between
 * /dashboard and a role root.
 */
export function getMisroutedRedirect(role: string | null | undefined, currentRoot: string): string | null {
  const r = role?.toUpperCase();
  if (!r || !KNOWN_ROLES.has(r)) return null;
  const target = getDashboardRoute(r);
  return target === currentRoot ? null : target;
}

export function validateRouteAccess(role: string, pathname: string): void {
  // Only throw in development to avoid crashing production unnecessarily
  if (process.env.NODE_ENV === 'development') {
    const normalizedRole = role?.toUpperCase();
    
    // Validate Super Admin trying to access Org Admin dashboard explicitly
    if (normalizedRole === UserRole.SUPER_ADMIN && pathname === ROUTES.ORG_ADMIN.DASHBOARD) {
      console.error(`[Navigation Error] Super Admin should not access the Organization Admin dashboard (${pathname}).`);
    }
    
    // Validate Org Admin trying to access Super Admin dashboard
    if ((normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.ORG_ADMIN) && pathname === ROUTES.SUPER_ADMIN.DASHBOARD) {
      console.error(`[Navigation Error] Organization Admin should not access the Super Admin dashboard (${pathname}).`);
    }
  }
}
