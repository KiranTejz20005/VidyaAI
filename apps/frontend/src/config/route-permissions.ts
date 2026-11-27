import { normalizeRole } from '@/utils/navigation';

/** Routes explicitly allowed per role. Sub-path access uses prefix matching except where denied. */
export const ROUTE_PERMISSIONS = {
  SUPER_ADMIN: [
    '/super-admin',
    '/dashboard', '/settings', '/profile'
  ],
  ADMIN: [
    '/admin',
    '/dashboard', '/settings', '/profile'
  ],
  ORG_ADMIN: [
    '/admin',
    '/dashboard', '/settings', '/profile'
  ],
  // Used by canAccessRoute (AppShell / guards). Faculty UI redirects /faculty → /teacher.
  // Existing route-permissions; no duplicate allow-list. User: fix all issues ASAP.
  FACULTY: [
    '/faculty',
    '/teacher',
    '/dashboard', '/assignments', '/assignments/create', '/settings', '/generate', '/ai-toolkit', '/grader', '/my-classes', '/papers', '/profile'
  ],
  TEACHER: [
    '/teacher',
    '/faculty',
    '/dashboard', '/assignments', '/assignments/create', '/settings', '/generate', '/ai-toolkit', '/grader', '/my-classes', '/papers', '/profile'
  ],
  STUDENT: [
    '/student',
    '/assignments',
    '/dashboard', '/settings', '/profile'
  ],
};

const STUDENT_DENIED_PREFIXES = [
  '/teacher',
  '/faculty',
  '/admin',
  '/super-admin',
  '/dashboard/teacher',
  '/dashboard/faculty',
  '/super-admin',
  '/assignments/create',
  '/assessments/create',
  '/grader',
  '/generate',
  '/papers',
];

/** Legacy /dashboard/* pages reachable through the shared '/dashboard' allow-list but meant for one role. */
const DASHBOARD_ROLE_ONLY: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/dashboard/superadmin', roles: ['SUPER_ADMIN'] },
  { prefix: '/dashboard/supervisor', roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
];

export const canAccessRoute = (role: string, path: string): boolean => {
  if (!role) return false;
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'SUPER_ADMIN') return true;

  const isSuperAdminRoute = path === '/super-admin' || path.startsWith('/super-admin/') || path === '/super-admin' || path.startsWith('/super-admin/');
  if (isSuperAdminRoute) {
    return false; // Already checked for SUPER_ADMIN above
  }

  const roleOnly = DASHBOARD_ROLE_ONLY.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
  if (roleOnly && !roleOnly.roles.includes(normalizedRole)) return false;

  if (normalizedRole === 'STUDENT') {
    if (STUDENT_DENIED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return false;
    }
  }

  const allowedRoutes = ROUTE_PERMISSIONS[normalizedRole as keyof typeof ROUTE_PERMISSIONS] || [];

  return allowedRoutes.some((route) => path === route || path.startsWith(`${route}/`));
};
