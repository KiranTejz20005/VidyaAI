import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../security/roles';
import { PERMISSIONS } from '../security/permissions';

const { authenticateMw, orgScopeMw, requireRoleCalls, requirePermissionCalls, gradePermissionMw } = vi.hoisted(
  () => ({
    authenticateMw: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
    orgScopeMw: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
    requireRoleCalls: [] as string[][],
    requirePermissionCalls: [] as string[],
    gradePermissionMw: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  }),
);

vi.mock('../middlewares/auth.middleware', () => ({
  authenticate: authenticateMw,
  requireOrganizationScope: () => orgScopeMw,
}));

vi.mock('../security/role.middleware', () => ({
  requireRole: (...roles: string[]) => {
    requireRoleCalls.push(roles.map((r) => r.toUpperCase()));
    return (_req: Request, _res: Response, next: NextFunction) => next();
  },
}));

vi.mock('../security/access-control', () => ({
  requirePermission: (permission: string) => {
    requirePermissionCalls.push(permission);
    return permission === 'GRADE_ASSESSMENT'
      ? gradePermissionMw
      : (_req: Request, _res: Response, next: NextFunction) => next();
  },
}));

vi.mock('../middlewares/validate.middleware', () => ({
  validate: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../api/grading/controller', () => ({
  saveGradingConfig: vi.fn(),
  getGradingConfig: vi.fn(),
  listSubmissionsForGrading: vi.fn(),
  evaluateSubmissionById: vi.fn(),
  getEvaluationResult: vi.fn(),
  overrideGrade: vi.fn(),
  bulkEvaluate: vi.fn(),
  getBulkEvaluateJobStatus: vi.fn(),
}));

import gradingRouter from '../api/grading/routes';

const gradePermissionUses = [...requirePermissionCalls];
const gradeRoleUses = [...requireRoleCalls];

describe('grading routes — authz wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports an Express router with authenticate and organization scope', () => {
    expect(gradingRouter).toBeDefined();
    expect(typeof gradingRouter).toBe('function');
    expect(gradingRouter.stack.length).toBeGreaterThan(0);

    const usesAuthenticate = gradingRouter.stack.some((layer) => layer.handle === authenticateMw);
    const usesOrgScope = gradingRouter.stack.some((layer) => layer.handle === orgScopeMw);
    expect(usesAuthenticate).toBe(true);
    expect(usesOrgScope).toBe(true);
  });

  it('applies GRADE_ASSESSMENT permission and FACULTY staff gates', () => {
    expect(gradePermissionUses).toContain(PERMISSIONS.GRADE_ASSESSMENT);

    expect(gradeRoleUses).toHaveLength(2);
    const [gradeStaffRoles, evaluationRoles] = gradeRoleUses;
    expect(gradeStaffRoles).toEqual(['TEACHER', 'FACULTY', 'ADMIN', 'SUPER_ADMIN']);
    expect(evaluationRoles).toEqual(['TEACHER', 'FACULTY', 'ADMIN', 'SUPER_ADMIN', 'STUDENT']);

    const routeLayers = gradingRouter.stack.filter((layer) => layer.route);
    expect(routeLayers).toHaveLength(10);

    const staffRoutesWithGradePermission = routeLayers.filter((layer) =>
      layer.route!.stack.some((mw) => mw.handle === gradePermissionMw),
    );
    expect(staffRoutesWithGradePermission.length).toBeGreaterThanOrEqual(7);
  });

  it('aligns TEACHER with GRADE_ASSESSMENT; ADMIN uses role gate without grade permission', () => {
    expect(hasPermission('TEACHER', PERMISSIONS.GRADE_ASSESSMENT)).toBe(true);
    expect(hasPermission('FACULTY', PERMISSIONS.GRADE_ASSESSMENT)).toBe(true);
    expect(hasPermission('ADMIN', PERMISSIONS.GRADE_ASSESSMENT)).toBe(false);
    expect(hasPermission('STUDENT', PERMISSIONS.GRADE_ASSESSMENT)).toBe(false);
  });
});