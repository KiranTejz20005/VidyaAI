import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const m = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  });
  return {
    prisma: {
      user: model(),
      generatedPaper: model(),
      auditLog: model(),
      libraryResource: model(),
      class: model(),
      classStudent: model(),
      assignment: model(),
      invitation: model(),
      organization: model(),
      department: model(),
      role: model(),
      userRole: model(),
      session: model(),
      promptExecution: model(),
      studentSubmission: model(),
      lessonPlan: model(),
    } as Record<string, any>,
    revokeAllUserSessions: vi.fn(),
    sendInvitationEmail: vi.fn(),
    getAdminAnalytics: vi.fn(),
  };
});

vi.mock('../../config/prisma', () => ({ default: m.prisma }));
vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../services/auth.service', () => ({
  revokeAllUserSessions: m.revokeAllUserSessions,
  hashPassword: vi.fn(async () => 'hashed'),
  generateAccessToken: vi.fn(() => 'token'),
}));
vi.mock('../../services/email.service', () => ({ sendInvitationEmail: m.sendInvitationEmail }));
vi.mock('../../services/analytics.service', () => ({
  AnalyticsService: { getAdminAnalytics: m.getAdminAnalytics },
}));
vi.mock('../../queues/generation.queue', () => ({ getGenerationQueue: vi.fn() }));
vi.mock('../../queues/pdf.queue', () => ({ getPdfQueue: vi.fn() }));
vi.mock('../../config/redis', () => ({ isRedisConnected: vi.fn(() => false) }));
vi.mock('../../services/storage/r2-storage', () => ({ getR2Storage: vi.fn() }));
vi.mock('../../services/audit.service', () => ({
  AuditService: { logAction: vi.fn(), logAuditEvent: vi.fn() },
}));
vi.mock('../../services/csv-import.service', () => ({ processCsvImport: vi.fn() }));
vi.mock('../../services/admin/billing.service', () => ({ BillingService: {} }));
vi.mock('../../services/admin/organization.service', () => ({ OrganizationService: {} }));
vi.mock('../../services/admin/department.service', () => ({ DepartmentService: {} }));
vi.mock('../../services/admin/role.service', () => ({ RoleService: {} }));
vi.mock('../../services/admin/classroom.service', () => ({ ClassroomService: {} }));
vi.mock('../../services/admin/group.service', () => ({ GroupService: {} }));

import { AdminController } from '../../controllers/admin.controller';
import { UserService } from '../../services/admin/user.service';
import { actorFromRequest } from '../../services/admin/admin-scope';
import { createInvitation } from '../../services/invitation.service';
import * as UsersApi from '../../api/users/controller';
import adminRouter from '../../routes/admin.routes';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const SENTINEL = '00000000-0000-0000-0000-000000000000';

function makeReq(user: Partial<NonNullable<Request['user']>> | undefined, extra: Record<string, unknown> = {}): Request {
  return {
    user,
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    ...extra,
  } as unknown as Request;
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  });
  return res as Response & { statusCode: number; body: any };
}

const adminA = { id: 'admin-a', email: 'a@a.edu', role: 'ADMIN', organizationId: ORG_A, activeOrganizationId: ORG_A } as any;
const adminNoOrg = { id: 'admin-x', email: 'x@a.edu', role: 'ADMIN', organizationId: SENTINEL, activeOrganizationId: undefined } as any;
const superNoOrg = { id: 'super-1', email: 's@a.edu', role: 'SUPER_ADMIN', organizationId: SENTINEL, activeOrganizationId: undefined } as any;

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(m.prisma)) {
    for (const fn of Object.values(model as Record<string, any>)) fn.mockReset?.();
  }
  m.prisma.user.findMany.mockResolvedValue([]);
  m.prisma.auditLog.findMany.mockResolvedValue([]);
  m.prisma.generatedPaper.findMany.mockResolvedValue([]);
  m.prisma.generatedPaper.count.mockResolvedValue(0);
  m.prisma.user.count.mockResolvedValue(0);
  m.prisma.assignment.count.mockResolvedValue(0);
  m.getAdminAnalytics.mockResolvedValue({});
});

describe('admin org-scope: fail closed when the caller has no organization', () => {
  it.each([
    ['getAnalytics', (r: Request, s: Response) => AdminController.getAnalytics(r, s)],
    ['getAuditLogs', (r: Request, s: Response) => AdminController.getAuditLogs(r, s)],
    ['getDashboardStats', (r: Request, s: Response) => AdminController.getDashboardStats(r, s)],
    ['getOrgAnalyticsDashboard', (r: Request, s: Response) => AdminController.getOrgAnalyticsDashboard(r, s)],
    ['getPapers', (r: Request, s: Response) => AdminController.getPapers(r, s)],
    ['getPaperAnalytics', (r: Request, s: Response) => AdminController.getPaperAnalytics(r, s)],
    ['getOrganizationSettings', (r: Request, s: Response) => AdminController.getOrganizationSettings(r, s)],
  ])('%s returns 403 and touches no data for an org-less ADMIN', async (_name, call) => {
    const res = makeRes();
    await call(makeReq(adminNoOrg), res);
    expect(res.statusCode).toBe(403);
    expect(m.getAdminAnalytics).not.toHaveBeenCalled();
    for (const model of Object.values(m.prisma)) {
      for (const fn of Object.values(model as Record<string, any>)) expect(fn).not.toHaveBeenCalled();
    }
  });

  it('getPendingApprovals does not fall back to the first organization', async () => {
    const res = makeRes();
    await AdminController.getPendingApprovals(makeReq(adminNoOrg), res);
    expect(res.statusCode).toBe(403);
    expect(m.prisma.organization.findFirst).not.toHaveBeenCalled();
    expect(m.prisma.assignment.findMany).not.toHaveBeenCalled();
  });

  it('getAnalytics passes the caller organization to the service for an ADMIN', async () => {
    const res = makeRes();
    await AdminController.getAnalytics(makeReq(adminA), res);
    expect(m.getAdminAnalytics).toHaveBeenCalledWith(ORG_A);
  });

  it('ADMIN cannot widen scope with ?organizationId=', async () => {
    const res = makeRes();
    await AdminController.getAnalytics(makeReq(adminA, { query: { organizationId: ORG_B } }), res);
    expect(m.getAdminAnalytics).toHaveBeenCalledWith(ORG_A);
  });

  it('SUPER_ADMIN without a selected organization is platform-wide (explicit cross-org)', async () => {
    const res = makeRes();
    await AdminController.getAnalytics(makeReq(superNoOrg), res);
    expect(res.statusCode).toBe(200);
    expect(m.getAdminAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('getAuditLogs filters by the ADMIN organization', async () => {
    const res = makeRes();
    await AdminController.getAuditLogs(makeReq(adminA), res);
    expect(m.prisma.auditLog.findMany.mock.calls[0][0].where.organizationId).toBe(ORG_A);
  });
});

describe('admin papers are tenant-scoped', () => {
  it('lists only the ADMIN organization papers', async () => {
    const res = makeRes();
    await AdminController.getPapers(makeReq(adminA), res);
    expect(m.prisma.generatedPaper.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG_A });
  });

  it('refuses to delete or archive a paper of another organization', async () => {
    m.prisma.generatedPaper.findFirst.mockResolvedValue(null);
    for (const fn of [AdminController.deletePaper, AdminController.archivePaper]) {
      const res = makeRes();
      await fn(makeReq(adminA, { params: { id: 'paper-b' } }), res);
      expect(res.statusCode).toBe(404);
    }
    expect(m.prisma.generatedPaper.findFirst.mock.calls[0][0].where).toEqual({ id: 'paper-b', organizationId: ORG_A });
    expect(m.prisma.generatedPaper.delete).not.toHaveBeenCalled();
    expect(m.prisma.generatedPaper.update).not.toHaveBeenCalled();
  });

  it('deletes a paper that belongs to the ADMIN organization', async () => {
    m.prisma.generatedPaper.findFirst.mockResolvedValue({ id: 'paper-a' });
    const res = makeRes();
    await AdminController.deletePaper(makeReq(adminA, { params: { id: 'paper-a' } }), res);
    expect(m.prisma.generatedPaper.delete).toHaveBeenCalledWith({ where: { id: 'paper-a' } });
  });
});

describe('legacy faculty/student endpoints cannot cross tenants or roles', () => {
  const teacherA = { id: 't-a', role: 'TEACHER', status: 'ACTIVE', organizationId: ORG_A, email: 't@a.edu' };

  it('resetFacultyPassword refuses a user of another organization (account takeover)', async () => {
    m.prisma.user.findUnique.mockResolvedValue({ id: 't-b', role: 'TEACHER', status: 'ACTIVE', organizationId: ORG_B, email: 't@b.edu' });
    const res = makeRes();
    await AdminController.resetFacultyPassword(
      makeReq(adminA, { params: { id: 't-b' }, body: { newPassword: 'Str0ng!Passw0rd#1' } }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(m.prisma.user.update).not.toHaveBeenCalled();
    expect(m.revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it('resetFacultyPassword refuses a SUPER_ADMIN and a peer ADMIN id', async () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN']) {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'v', role, status: 'ACTIVE', organizationId: role === 'ADMIN' ? ORG_A : null, email: 'v@a.edu' });
      const res = makeRes();
      await AdminController.resetFacultyPassword(
        makeReq(adminA, { params: { id: 'v' }, body: { newPassword: 'Str0ng!Passw0rd#1' } }),
        res,
      );
      expect([403, 404]).toContain(res.statusCode);
    }
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });

  it('resetFacultyPassword works for a teacher of the same organization and signs them out', async () => {
    m.prisma.user.findUnique.mockResolvedValue(teacherA);
    m.prisma.user.update.mockResolvedValue({ id: 't-a' });
    const res = makeRes();
    await AdminController.resetFacultyPassword(makeReq(adminA, { params: { id: 't-a' }, body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(m.revokeAllUserSessions).toHaveBeenCalledWith('t-a');
  });

  it('updateFaculty cannot edit a user of another organization or a SUPER_ADMIN', async () => {
    for (const target of [
      { id: 'x', role: 'TEACHER', status: 'ACTIVE', organizationId: ORG_B, email: 'x@b.edu' },
      { id: 'x', role: 'SUPER_ADMIN', status: 'ACTIVE', organizationId: ORG_A, email: 'x@a.edu' },
      { id: 'x', role: 'ADMIN', status: 'ACTIVE', organizationId: ORG_A, email: 'x@a.edu' },
    ]) {
      m.prisma.user.findUnique.mockResolvedValue(target);
      const res = makeRes();
      await AdminController.updateFaculty(makeReq(adminA, { params: { id: 'x' }, body: { email: 'evil@x.com' } }), res);
      expect([403, 404]).toContain(res.statusCode);
    }
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });

  it('updateFaculty rejects a department from another organization', async () => {
    m.prisma.user.findUnique.mockResolvedValue(teacherA);
    m.prisma.department.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await AdminController.updateFaculty(makeReq(adminA, { params: { id: 't-a' }, body: { departmentId: 'dept-b' } }), res);
    expect(res.statusCode).toBe(400);
    expect(m.prisma.department.findFirst.mock.calls[0][0].where).toEqual({ id: 'dept-b', organizationId: ORG_A });
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });

  it('deactivateFaculty / deactivateStudent suspend via the service (sessions revoked) and never return the password hash', async () => {
    m.prisma.user.findUnique.mockResolvedValue(teacherA);
    m.prisma.user.update.mockResolvedValue({ id: 't-a', status: 'SUSPENDED' });
    const res = makeRes();
    await AdminController.deactivateFaculty(makeReq(adminA, { params: { id: 't-a' }, body: { status: 'SUSPENDED' } }), res);
    expect(res.statusCode).toBe(200);
    expect(m.revokeAllUserSessions).toHaveBeenCalledWith('t-a');
    expect(m.prisma.user.update.mock.calls[0][0].select).toBeDefined();
  });

  it('deactivateStudent refuses a faculty/admin id and other-org students', async () => {
    for (const target of [
      { id: 's', role: 'ADMIN', status: 'ACTIVE', organizationId: ORG_A, email: 's@a.edu' },
      { id: 's', role: 'STUDENT', status: 'ACTIVE', organizationId: ORG_B, email: 's@b.edu' },
    ]) {
      m.prisma.user.findUnique.mockResolvedValue(target);
      const res = makeRes();
      await AdminController.deactivateStudent(makeReq(adminA, { params: { id: 's' }, body: { status: 'SUSPENDED' } }), res);
      expect(res.statusCode).toBe(404);
    }
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });

  it('createStudent rejects a classId from another organization', async () => {
    m.prisma.user.findUnique.mockResolvedValue(null);
    m.prisma.class.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await AdminController.createStudent(
      makeReq(adminA, { body: { firstName: 'A', lastName: 'B', email: 'S@a.edu', classId: 'class-b' } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(m.prisma.class.findFirst.mock.calls[0][0].where).toEqual({ id: 'class-b', organizationId: ORG_A });
    expect(m.prisma.user.create).not.toHaveBeenCalled();
    expect(m.prisma.classStudent.create).not.toHaveBeenCalled();
  });
});

describe('admin user management: privilege escalation', () => {
  it('an ADMIN cannot suspend or delete their own account', async () => {
    m.prisma.user.findUnique.mockResolvedValue({ id: adminA.id, role: 'ADMIN', status: 'ACTIVE', organizationId: ORG_A });
    for (const fn of [AdminController.suspendUser, AdminController.deleteUser]) {
      const res = makeRes();
      await fn(makeReq(adminA, { params: { id: adminA.id }, body: { suspend: true } }), res);
      expect(res.statusCode).toBe(403);
    }
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });

  it('an ADMIN cannot suspend/delete/reset a user of another organization', async () => {
    m.prisma.user.findUnique.mockResolvedValue({ id: 'u-b', role: 'TEACHER', status: 'ACTIVE', organizationId: ORG_B });
    for (const fn of [AdminController.suspendUser, AdminController.deleteUser, AdminController.resetPassword, AdminController.updateUser]) {
      const res = makeRes();
      await fn(makeReq(adminA, { params: { id: 'u-b' }, body: { suspend: true, role: 'TEACHER' } }), res);
      expect(res.statusCode).toBe(403);
    }
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });

  it('an ADMIN cannot assign SUPER_ADMIN (any casing/alias) on create or update', async () => {
    const res = makeRes();
    await AdminController.createUser(makeReq(adminA, { body: { role: 'SUPER_ADMIN', email: 'e@a.edu' } }), res);
    expect(res.statusCode).toBe(403);

    m.prisma.user.findUnique.mockResolvedValue({ id: 'u', role: 'TEACHER', status: 'ACTIVE', organizationId: ORG_A, email: 'u@a.edu' });
    const res2 = makeRes();
    await AdminController.updateUser(makeReq(adminA, { params: { id: 'u' }, body: { role: 'super_admin' } }), res2);
    expect(res2.statusCode).toBe(403);
    expect(m.prisma.user.update).not.toHaveBeenCalled();
    expect(m.prisma.user.create).not.toHaveBeenCalled();
  });

  it('UserService.updateUser: no self role change, no cross-org move, role change revokes sessions', async () => {
    const actor = actorFromRequest(makeReq(adminA));
    m.prisma.user.findUnique.mockResolvedValue({ id: adminA.id, role: 'ADMIN', status: 'ACTIVE', organizationId: ORG_A, email: 'a@a.edu' });
    await expect(UserService.updateUser(actor, adminA.id, { role: 'TEACHER' })).rejects.toMatchObject({ statusCode: 403 });

    m.prisma.user.findUnique.mockResolvedValue({ id: 'u', role: 'TEACHER', status: 'ACTIVE', organizationId: ORG_A, email: 'u@a.edu' });
    await expect(UserService.updateUser(actor, 'u', { organizationId: ORG_B })).rejects.toMatchObject({ statusCode: 403 });
    await expect(UserService.updateUser(actor, 'u', { role: 'SUPER_ADMIN' })).rejects.toMatchObject({ statusCode: 403 });
    expect(m.prisma.user.update).not.toHaveBeenCalled();

    m.prisma.user.update.mockResolvedValue({});
    m.prisma.role.findUnique.mockResolvedValue(null);
    m.prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u' });
    await UserService.updateUser(actor, 'u', { role: 'STUDENT' });
    expect(m.revokeAllUserSessions).toHaveBeenCalledWith('u');
  });
});

describe('invitation flow cannot grant elevated roles or cross organizations', () => {
  it('inviteUser refuses SUPER_ADMIN for an ADMIN (case-insensitive) and for aliases', async () => {
    for (const role of ['SUPER_ADMIN', 'super_admin', ' Super_Admin ']) {
      const res = makeRes();
      await AdminController.inviteUser(makeReq(adminA, { body: { email: 'x@a.edu', role } }), res);
      expect(res.statusCode).toBe(403);
    }
    expect(m.prisma.invitation.create).not.toHaveBeenCalled();
  });

  // Behaviour: org ADMIN cannot mint/manage peer ADMINs. Module: AdminController + UserService.
  // Existing file: this suite. Phase 3 least-privilege peer-admin policy.
  it('inviteUser and createUser refuse ADMIN for an org ADMIN (least privilege)', async () => {
    const inviteRes = makeRes();
    await AdminController.inviteUser(makeReq(adminA, { body: { email: 'peer@a.edu', role: 'ADMIN' } }), inviteRes);
    expect(inviteRes.statusCode).toBe(403);
    expect(m.prisma.invitation.create).not.toHaveBeenCalled();

    const createRes = makeRes();
    await AdminController.createUser(
      makeReq(adminA, { body: { email: 'peer2@a.edu', role: 'ADMIN', firstName: 'P', lastName: 'A' } }),
      createRes,
    );
    expect(createRes.statusCode).toBe(403);
    expect(m.prisma.user.create).not.toHaveBeenCalled();
  });

  it('org ADMIN cannot suspend, reset, or delete a peer ADMIN', async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      id: 'peer-admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      organizationId: ORG_A,
      email: 'peer@a.edu',
    });
    for (const fn of [AdminController.suspendUser, AdminController.resetPassword, AdminController.deleteUser]) {
      const res = makeRes();
      await fn(makeReq(adminA, { params: { id: 'peer-admin' }, body: { suspend: true, newPassword: 'TempPass1!' } }), res);
      expect(res.statusCode).toBe(403);
    }
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });

  it('findManageableUser forbids peer ADMIN for org ADMIN', async () => {
    const actor = actorFromRequest(makeReq(adminA));
    m.prisma.user.findUnique.mockResolvedValue({
      id: 'peer-admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      organizationId: ORG_A,
      email: 'peer@a.edu',
    });
    await expect(UserService.findManageableUser(actor, 'peer-admin')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('inviteUser rejects an unknown role and a SUPER_ADMIN invite even from a SUPER_ADMIN', async () => {
    const bad = makeRes();
    await AdminController.inviteUser(makeReq(adminA, { body: { email: 'x@a.edu', role: 'GOD' } }), bad);
    expect(bad.statusCode).toBe(400);

    const sup = makeRes();
    await AdminController.inviteUser(
      makeReq({ ...superNoOrg, activeOrganizationId: ORG_A }, { body: { email: 'x@a.edu', role: 'SUPER_ADMIN' } }),
      sup,
    );
    expect(sup.statusCode).toBe(400);
    expect(m.prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('inviteUser binds the invitation to the caller organization, ignoring a body organizationId', async () => {
    m.prisma.user.findUnique.mockResolvedValue(null);
    m.prisma.invitation.updateMany.mockResolvedValue({ count: 0 });
    m.prisma.invitation.create.mockResolvedValue({ id: 'i', email: 'x@a.edu', role: 'TEACHER', organizationId: ORG_A, token: 'digest' });
    m.sendInvitationEmail.mockResolvedValue(true);
    const res = makeRes();
    await AdminController.inviteUser(
      makeReq(adminA, { body: { email: 'X@A.edu', role: 'FACULTY', organizationId: ORG_B } }),
      res,
    );
    expect(res.statusCode).toBe(201);
    const data = m.prisma.invitation.create.mock.calls[0][0].data;
    expect(data.organizationId).toBe(ORG_A);
    expect(data.role).toBe('TEACHER');
    expect(data.email).toBe('x@a.edu');
    expect(res.body.data.token).toBeUndefined();
  });

  it('createInvitation only cancels pending invitations of the same organization', async () => {
    m.prisma.user.findUnique.mockResolvedValue(null);
    m.prisma.invitation.updateMany.mockResolvedValue({ count: 0 });
    m.prisma.invitation.create.mockResolvedValue({ id: 'i', token: 'd' });
    m.sendInvitationEmail.mockResolvedValue(true);
    await createInvitation({ email: 'v@x.edu', role: 'TEACHER', organizationId: ORG_A, createdById: 'admin-a' });
    expect(m.prisma.invitation.updateMany.mock.calls[0][0].where).toEqual({
      email: 'v@x.edu',
      organizationId: ORG_A,
      status: 'PENDING',
    });
  });
});

describe('knowledge resources are tenant-scoped', () => {
  it('delete refuses a resource of another organization', async () => {
    m.prisma.libraryResource.findUnique.mockResolvedValue({ id: 'r', organizationId: ORG_B, fileUrl: '' });
    const res = makeRes();
    await AdminController.deleteKnowledgeResource(makeReq(adminA, { params: { id: 'r' } }), res);
    expect(res.statusCode).toBe(404);
    expect(m.prisma.libraryResource.delete).not.toHaveBeenCalled();
  });

  it('create ignores a body organizationId for an ADMIN', async () => {
    m.prisma.libraryResource.create.mockResolvedValue({ id: 'r' });
    const res = makeRes();
    await AdminController.createKnowledgeResource(
      makeReq(adminA, { body: { title: 'T', organizationId: ORG_B, externalUrl: 'https://x.test/a.pdf' } }),
      res,
    );
    expect(m.prisma.libraryResource.create.mock.calls[0][0].data.organizationId).toBe(ORG_A);
  });

  it('create refuses an org-less ADMIN instead of falling back to the first organization', async () => {
    const res = makeRes();
    await AdminController.createKnowledgeResource(
      makeReq(adminNoOrg, { body: { title: 'T', externalUrl: 'https://x.test/a.pdf' } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(m.prisma.organization.findFirst).not.toHaveBeenCalled();
    expect(m.prisma.libraryResource.create).not.toHaveBeenCalled();
  });
});

describe('/api/users controller is tenant-scoped', () => {
  it('getUser queries within the caller organization', async () => {
    m.prisma.user.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await UsersApi.getUser(
      makeReq(adminA, { params: { id: '11111111-1111-4111-8111-111111111111' } }),
      res,
    );
    expect(m.prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: ORG_A });
    expect(m.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('deactivateUser cannot suspend a user of another organization, a SUPER_ADMIN, or self', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    for (const target of [
      { id, role: 'TEACHER', status: 'ACTIVE', organizationId: ORG_B },
      { id, role: 'SUPER_ADMIN', status: 'ACTIVE', organizationId: ORG_A },
    ]) {
      m.prisma.user.findUnique.mockResolvedValue(target);
      const res = makeRes();
      await UsersApi.deactivateUser(makeReq(adminA, { params: { id } }), res);
      expect(res.statusCode).toBe(500); // handler maps all failures to a generic error
    }
    m.prisma.user.findUnique.mockResolvedValue({ id, role: 'ADMIN', status: 'ACTIVE', organizationId: ORG_A });
    const selfRes = makeRes();
    await UsersApi.deactivateUser(makeReq({ ...adminA, id }, { params: { id } }), selfRes);
    expect(m.prisma.user.update).not.toHaveBeenCalled();
    expect(m.revokeAllUserSessions).not.toHaveBeenCalled();
  });
});

describe('admin router: global resources are SUPER_ADMIN only', () => {
  function routeHandlers(path: string, method: string): Array<(req: Request, res: Response, next: () => void) => unknown> {
    const layer = (adminRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    expect(layer, `${method} ${path}`).toBeTruthy();
    return layer.route.stack.map((s: any) => s.handle);
  }

  it.each([
    ['/roles', 'get'],
    ['/roles', 'post'],
    ['/permissions', 'get'],
    ['/ai-providers', 'get'],
    ['/ai-providers/health', 'post'],
    ['/ai-providers/failover', 'put'],
    ['/queues/health', 'get'],
    ['/queues/failed', 'get'],
    ['/queues/retry', 'post'],
    ['/settings', 'put'],
  ])('%s %s rejects an ADMIN before the handler', (path, method) => {
    const handlers = routeHandlers(path, method);
    expect(handlers.length).toBeGreaterThan(1);
    const res = makeRes();
    const next = vi.fn();
    handlers[0](makeReq(adminA), res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
