import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  assignment: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  rubric: { findFirst: vi.fn() },
  assignmentGradingConfig: { upsert: vi.fn() },
  generatedPaper: { findFirst: vi.fn() },
  generationJob: { findFirst: vi.fn(), create: vi.fn() },
  user: { findFirst: vi.fn() },
  class: { findFirst: vi.fn() },
  organization: { findUnique: vi.fn() },
  knowledgeDocument: { findFirst: vi.fn() },
  knowledgeChunk: { findFirst: vi.fn(), findMany: vi.fn() },
  chunkQualityMetrics: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
}));

vi.mock('../../config/prisma', () => ({ default: prismaMock }));
vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
// Heavy collaborators that are irrelevant to authorization (queues, sockets, AI, analytics).
vi.mock('../../sockets/socket.server', () => ({ emitToAssignment: vi.fn(), emitToGroup: vi.fn() }));
vi.mock('../../workflows/workflow-engine', () => ({ workflowEngine: {} }));
vi.mock('../../queues/pdf.queue', () => ({ getPdfQueue: vi.fn() }));
vi.mock('../../services/grader.service', () => ({
  evaluateSubmission: vi.fn(),
  extractTextFromFile: vi.fn(),
  overrideEvaluation: vi.fn(),
}));
vi.mock('../../services/analytics.service', () => ({
  AnalyticsService: {
    getStudentPerformance: vi.fn().mockResolvedValue({ averageScore: 0, growthTrend: [], topicMastery: [] }),
    getGroupPerformance: vi.fn(),
    getAdminAnalytics: vi.fn().mockResolvedValue({ totals: {} }),
  },
}));
vi.mock('../../services/knowledge-quality.service', () => ({
  KnowledgeQualityService: { evaluateChunkQuality: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../services/admin/organization.service', () => ({
  OrganizationService: {
    getOrganizations: vi.fn(),
    getOrganizationById: vi.fn(),
    updateOrganization: vi.fn(),
    getOrganizationAnalytics: vi.fn(),
  },
}));
vi.mock('../../services/admin/department.service', () => ({
  DepartmentService: { getDepartments: vi.fn(), createDepartment: vi.fn() },
}));

import { saveGradingConfig } from '../../controllers/grader.controller';
import { getPaper } from '../../services/paper.service';
import { listAssignments } from '../../services/assignment.service';
import { listAssignmentsHandler } from '../../controllers/assignment.controller';
import * as Reports from '../../api/reports/controller';
import * as Knowledge from '../../api/knowledge/controller';
import * as Orgs from '../../api/organizations/controller';
import { OrganizationService } from '../../services/admin/organization.service';
import { DepartmentService } from '../../services/admin/department.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEACHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STUDENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const reqFor = (role: string, over: Record<string, unknown> = {}, id = TEACHER, org = ORG_A) =>
  ({ user: { id, role, organizationId: org }, params: {}, query: {}, body: {}, ...over }) as any;

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = vi.fn();
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('legacy grader: grading config', () => {
  it('cannot attach a rubric of another organization (would expose its criteria)', async () => {
    prismaMock.assignment.findFirst.mockResolvedValue({ id: 'a1', organizationId: ORG_A, createdById: TEACHER });
    prismaMock.rubric.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await saveGradingConfig(reqFor('TEACHER', { params: { assignmentId: 'a1' }, body: { rubricId: 'foreign-rubric' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.rubric.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-rubric', organizationId: ORG_A },
      select: { id: true },
    });
    expect(prismaMock.assignmentGradingConfig.upsert).not.toHaveBeenCalled();
  });
});

describe('paper lookup by id stays inside the authorized assignment', () => {
  it('?paperId= cannot reach a paper of a different assignment', async () => {
    prismaMock.generatedPaper.findFirst.mockResolvedValue(null);
    await getPaper('assignment-in-my-org', 'paper-of-someone-else');
    expect(prismaMock.generatedPaper.findFirst).toHaveBeenCalledWith({
      where: { id: 'paper-of-someone-else', assignmentId: 'assignment-in-my-org' },
    });
  });
});

describe('assignment list for students', () => {
  it('only published statuses are returned to a student, even when asking for DRAFT', async () => {
    prismaMock.assignment.findMany.mockResolvedValue([]);
    prismaMock.assignment.count.mockResolvedValue(0);
    const res = makeRes();
    await listAssignmentsHandler(reqFor('STUDENT', { query: { status: 'DRAFT' } }, STUDENT), res);
    const where = prismaMock.assignment.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG_A);
    expect(where.status).toEqual({ in: [] });
  });

  it('a student listing without a status filter is restricted to the published allow-list', async () => {
    prismaMock.assignment.findMany.mockResolvedValue([]);
    prismaMock.assignment.count.mockResolvedValue(0);
    await listAssignmentsHandler(reqFor('STUDENT', {}, STUDENT), makeRes());
    const where = prismaMock.assignment.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(expect.arrayContaining(['PUBLISHED']));
    expect(where.status.in).not.toContain('DRAFT');
    expect(where.status.in).not.toContain('PENDING_APPROVAL');
  });

  it('staff are not restricted by the student allow-list', async () => {
    prismaMock.assignment.findMany.mockResolvedValue([]);
    prismaMock.assignment.count.mockResolvedValue(0);
    await listAssignments(1, 10, 'DRAFT' as any, ORG_A, undefined);
    expect(prismaMock.assignment.findMany.mock.calls[0][0].where).toEqual({ status: 'DRAFT', organizationId: ORG_A });
  });
});

describe('/api/v1/reports', () => {
  it('a student cannot pull another student report', async () => {
    const res = makeRes();
    await Reports.getStudentReport(reqFor('STUDENT', { params: { studentId: 'someone-else' } }, STUDENT), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('staff can only report on students of their own organization', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await Reports.getStudentReport(reqFor('TEACHER', { params: { studentId: 'foreign' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', role: 'STUDENT', organizationId: ORG_A },
      select: { id: true },
    });
  });

  it('an ADMIN cannot read another organization report', async () => {
    const res = makeRes();
    await Reports.getOrganizationReport(reqFor('ADMIN', { params: { orgId: ORG_B } }, ADMIN), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('assignment, class, status and download reports are tenant (and owner) scoped', async () => {
    prismaMock.assignment.findFirst.mockResolvedValue(null);
    prismaMock.class.findFirst.mockResolvedValue(null);
    prismaMock.generationJob.findFirst.mockResolvedValue(null);

    const a = makeRes();
    await Reports.getAssignmentReport(reqFor('TEACHER', { params: { assignmentId: 'x' } }), a);
    expect(prismaMock.assignment.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', organizationId: ORG_A, createdById: TEACHER });

    const c = makeRes();
    await Reports.getClassReport(reqFor('TEACHER', { params: { classId: 'x' } }), c);
    expect(prismaMock.class.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', organizationId: ORG_A, facultyId: TEACHER });

    const s = makeRes();
    await Reports.getReportStatus(reqFor('ADMIN', { params: { jobId: 'j' } }, ADMIN), s);
    expect(prismaMock.generationJob.findFirst.mock.calls[0][0].where).toEqual({ id: 'j', assignment: { organizationId: ORG_A } });

    const d = makeRes();
    await Reports.downloadReport(reqFor('ADMIN', { params: { reportId: 'j' } }, ADMIN), d);
    expect([a.statusCode, c.statusCode, s.statusCode, d.statusCode]).toEqual([404, 404, 404, 404]);
  });

  it('a report job can only be queued for an assignment the caller owns', async () => {
    prismaMock.assignment.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await Reports.generateAssignmentReport(reqFor('TEACHER', { body: { assignmentId: 'foreign' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.generationJob.create).not.toHaveBeenCalled();
  });
});

describe('/api/v1/knowledge', () => {
  it('a body-supplied organizationId can no longer redirect an evaluation to another tenant', async () => {
    prismaMock.knowledgeChunk.findMany.mockResolvedValue([{ id: 'c1' }]);
    const res = makeRes();
    await Knowledge.triggerEvaluation(
      reqFor('TEACHER', { body: { organizationId: ORG_B } }),
      { ...res, status: () => ({ json: vi.fn() }), json: vi.fn() } as any,
    );
    expect(prismaMock.knowledgeChunk.findMany.mock.calls[0][0].where).toEqual({ document: { organizationId: ORG_A } });
  });

  it('document, chunk and job lookups are tenant scoped and answer 404', async () => {
    prismaMock.knowledgeDocument.findFirst.mockResolvedValue(null);
    prismaMock.knowledgeChunk.findFirst.mockResolvedValue(null);
    prismaMock.generationJob.findFirst.mockResolvedValue(null);
    await expect(Knowledge.getDocumentQuality(reqFor('TEACHER', { params: { documentId: 'd' } }), makeRes())).rejects.toMatchObject({ statusCode: 404 });
    await expect(Knowledge.getChunkQuality(reqFor('TEACHER', { params: { chunkId: 'c' } }), makeRes())).rejects.toMatchObject({ statusCode: 404 });
    await expect(Knowledge.checkEvaluationJob(reqFor('TEACHER', { params: { jobId: 'j' } }), makeRes())).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.knowledgeDocument.findFirst.mock.calls[0][0].where).toEqual({ id: 'd', organizationId: ORG_A });
    expect(prismaMock.knowledgeChunk.findFirst.mock.calls[0][0].where).toEqual({ id: 'c', document: { organizationId: ORG_A } });
    expect(prismaMock.generationJob.findFirst.mock.calls[0][0].where).toEqual({ id: 'j', organizationId: ORG_A });
  });
});

describe('/api/v1/organizations', () => {
  it('an ADMIN only ever sees their own organization in the list', async () => {
    (OrganizationService.getOrganizations as any).mockResolvedValue([
      { id: ORG_A, name: 'A', users: [], _count: {} },
      { id: ORG_B, name: 'B', users: [], _count: {} },
    ]);
    const res = makeRes();
    await Orgs.listOrganizations(reqFor('ADMIN', {}, ADMIN), res);
    const ids = (res.body?.data ?? []).map((o: any) => o.id);
    expect(ids).toEqual([ORG_A]);
  });

  it('foreign organization detail, departments, usage and edits are 404 without touching the service', async () => {
    const admin = (params: Record<string, unknown>, body: Record<string, unknown> = {}) => reqFor('ADMIN', { params, body }, ADMIN);
    const results = [makeRes(), makeRes(), makeRes(), makeRes(), makeRes()];
    await Orgs.getOrganization(admin({ id: ORG_B }), results[0]);
    await Orgs.listDepartments(admin({ id: ORG_B }), results[1]);
    await Orgs.createDepartment(admin({ id: ORG_B }, { name: 'D', code: 'D1' }), results[2]);
    await Orgs.getOrganizationUsage(admin({ id: ORG_B }), results[3]);
    await Orgs.updateOrganization(admin({ id: ORG_B }, { name: 'Renamed' }), results[4]);
    expect(results.map((r) => r.statusCode)).toEqual([404, 404, 404, 404, 404]);
    expect(OrganizationService.getOrganizationById).not.toHaveBeenCalled();
    expect(DepartmentService.getDepartments).not.toHaveBeenCalled();
    expect(DepartmentService.createDepartment).not.toHaveBeenCalled();
    expect(OrganizationService.updateOrganization).not.toHaveBeenCalled();
  });

  it('a SUPER_ADMIN may still address any organization', async () => {
    (OrganizationService.getOrganizationById as any).mockResolvedValue({ id: ORG_B, name: 'B', departments: [] });
    const res = makeRes();
    await Orgs.getOrganization(reqFor('SUPER_ADMIN', { params: { id: ORG_B } }, ADMIN, '00000000-0000-0000-0000-000000000000'), res);
    expect(res.statusCode).toBe(200);
  });
});
