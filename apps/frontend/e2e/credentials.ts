/**
 * E2E credentials come exclusively from the environment. Nothing is hardcoded:
 * set the variables below (e.g. in CI secrets) to the passwords of the users
 * created by `apps/backend/prisma/seed-test-users.ts`.
 *
 *   E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD
 *   E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD
 *   E2E_ADMIN_EMAIL   / E2E_ADMIN_PASSWORD
 *
 * Suites whose role has no password configured are skipped with a message.
 */

export type E2ERoleName = 'student' | 'teacher' | 'admin';

export type E2ERole = {
  name: E2ERoleName;
  email: string;
  password: string | undefined;
  passwordEnvVar: string;
  dashboardPath: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

export const E2E_ROLES: Record<E2ERoleName, E2ERole> = {
  student: {
    name: 'student',
    email: readEnv('E2E_STUDENT_EMAIL') ?? 'student@vidyaai.com',
    password: readEnv('E2E_STUDENT_PASSWORD'),
    passwordEnvVar: 'E2E_STUDENT_PASSWORD',
    dashboardPath: '/dashboard/student',
  },
  teacher: {
    name: 'teacher',
    email: readEnv('E2E_TEACHER_EMAIL') ?? 'faculty@vidyaai.com',
    password: readEnv('E2E_TEACHER_PASSWORD'),
    passwordEnvVar: 'E2E_TEACHER_PASSWORD',
    dashboardPath: '/dashboard/faculty',
  },
  admin: {
    name: 'admin',
    email: readEnv('E2E_ADMIN_EMAIL') ?? 'admin@vidyaai.com',
    password: readEnv('E2E_ADMIN_PASSWORD'),
    passwordEnvVar: 'E2E_ADMIN_PASSWORD',
    dashboardPath: '/dashboard/admin',
  },
};

export function missingCredentialsMessage(role: E2ERole): string {
  return `Skipping ${role.name} E2E suite: set ${role.passwordEnvVar} to run it.`;
}
