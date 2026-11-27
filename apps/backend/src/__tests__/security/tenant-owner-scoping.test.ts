import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  generatedPaper: { findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  assignment: { delete: vi.fn() },
  lessonPlan: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  question: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  questionReview: { create: vi.fn(), findMany: vi.fn() },
  libraryResource: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  group: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  class: { findFirst: vi.fn() },
  classStudent: { count: vi.fn() },
  groupStudent: { deleteMany: vi.fn(), delete: vi.fn(), create: vi.fn(), createMany: vi.fn() },
  communityGroup: { create: vi.fn() },
  groupMember: { create: vi.fn(), createMany: vi.fn() },
  user: { count: vi.fn(), findMany: vi.fn() },
  leaveApplication: { findFirst: vi.fn(), update: vi.fn() },
  attendanceRecord: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  assessment: { findMany: vi.fn() },
}));

vi.mock('../../config/prisma', () => ({ default: prismaMock }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../services/teacher-copilot.service', () => ({ TeacherCopilotService: {} }));
vi.mock('../../services/storage/r2-storage', () => ({ getR2Storage: vi.fn() }));
vi.mock('../../queues/ingestion.queue', () => ({ ingestionQueue: { add: vi.fn() } }));

import * as Copilot from '../../controllers/copilot.controller';
import * as Review from '../../controllers/review.controller';
import * as Library from '../../controllers/library.controller';
import * as Group from '../../controllers/group.controller';
import * as Attendance from '../../controllers/attendance.controller';
import * as Assessment from '../../controllers/assessment.controller';
import libraryRouter from '../../routes/library.routes';
import teacherRouter from '../../routes/teacher.routes';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_ADMIN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_TEACHER_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const reqFor = (role: string, over: Record<string, unknown> = {}, userId = U_TEACHER_A, org = ORG_A) =>
  ({
    user: { id: userId, role, organizationId: org },
    params: {},
    query: {},
    body: {},
    ...over,
  }) as any;

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined, redirected: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.redirect = (u: string) => ((res.redirected = u), res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('copilot test papers and lesson plans', () => {
  it('a teacher cannot fetch a generated paper of another organization or another teacher', async () => {
    prismaMock.generatedPaper.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await Copilot.getTestPaperById(reqFor('TEACHER', { params: { id: 'paper-1' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.generatedPaper.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'paper-1', organizationId: ORG_A, assignment: { createdById: U_TEACHER_A } },
      }),
    );
  });

  it('an ADMIN is confined to the organization but not to a creator', async () => {
    prismaMock.generatedPaper.findFirst.mockResolvedValue(null);
    await Copilot.getTestPaperById(reqFor('ADMIN', { params: { id: 'paper-1' } }, U_ADMIN_A), makeRes());
    expect(prismaMock.generatedPaper.findFirst.mock.calls[0][0].where).toEqual({ id: 'paper-1', organizationId: ORG_A });
  });

  it('deleting an out-of-scope paper is a 404 and deletes neither the paper nor its assignment', async () => {
    prismaMock.generatedPaper.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await Copilot.deleteTestPaper(reqFor('TEACHER', { params: { id: 'paper-1' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.generatedPaper.delete).not.toHaveBeenCalled();
    expect(prismaMock.assignment.delete).not.toHaveBeenCalled();
  });

  it('the paper list is scoped to the organization and (for teachers) the creator', async () => {
    prismaMock.generatedPaper.findMany.mockResolvedValue([]);
    await Copilot.getTestPapers(reqFor('TEACHER'), makeRes());
    expect(prismaMock.generatedPaper.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG_A,
      assignment: { createdById: U_TEACHER_A },
    });
  });

  it('an ADMIN of another organization cannot update or delete a lesson plan', async () => {
    prismaMock.lessonPlan.findUnique.mockResolvedValue({ id: 'lp', userId: U_TEACHER_A, organizationId: ORG_A });
    const outsider = reqFor('ADMIN', { params: { id: 'lp' }, body: { title: 'x' } }, U_ADMIN_A, ORG_B);
    const res1 = makeRes();
    await Copilot.updateLessonPlan(outsider, res1);
    const res2 = makeRes();
    await Copilot.deleteLessonPlan(outsider, res2);
    expect(res1.statusCode).toBe(404);
    expect(res2.statusCode).toBe(404);
    expect(prismaMock.lessonPlan.update).not.toHaveBeenCalled();
    expect(prismaMock.lessonPlan.delete).not.toHaveBeenCalled();
  });

  it('an ADMIN of the same organization may still delete a colleague lesson plan', async () => {
    prismaMock.lessonPlan.findUnique.mockResolvedValue({ id: 'lp', userId: U_TEACHER_A, organizationId: ORG_A });
    const res = makeRes();
    await Copilot.deleteLessonPlan(reqFor('ADMIN', { params: { id: 'lp' } }, U_ADMIN_A, ORG_A), res);
    expect(prismaMock.lessonPlan.delete).toHaveBeenCalledWith({ where: { id: 'lp' } });
  });
});

describe('question review is tenant scoped', () => {
  it('cannot approve (and publish) a question of another organization', async () => {
    prismaMock.question.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await Review.submitReview(reqFor('ADMIN', { body: { questionId: 'q1', status: 'APPROVED' } }, U_ADMIN_A), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.question.findFirst).toHaveBeenCalledWith({
      where: { id: 'q1', organizationId: ORG_A },
      select: { id: true },
    });
    expect(prismaMock.questionReview.create).not.toHaveBeenCalled();
    expect(prismaMock.question.update).not.toHaveBeenCalled();
  });

  it('cannot read reviews of a foreign question and the pending queue is org scoped', async () => {
    prismaMock.question.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await Review.getReviewsForQuestion(reqFor('ADMIN', { params: { questionId: 'q1' } }, U_ADMIN_A), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.questionReview.findMany).not.toHaveBeenCalled();

    prismaMock.question.findMany.mockResolvedValue([]);
    await Review.getPendingReviews(reqFor('ADMIN', {}, U_ADMIN_A), makeRes());
    expect(prismaMock.question.findMany.mock.calls[0][0].where).toEqual({ isPublished: false, organizationId: ORG_A });
  });
});

describe('library files', () => {
  it('download and view sit behind authenticate + organization scope', () => {
    const stack = (libraryRouter as any).stack as any[];
    const authIdx = stack.findIndex((l) => !l.route && l.handle?.name === 'authenticate');
    const scopeIdx = stack.findIndex((l) => !l.route && l.handle?.name !== 'authenticate' && l.name === '<anonymous>');
    expect(authIdx).toBeGreaterThanOrEqual(0);
    for (const path of ['/:id/download', '/:id/view']) {
      const idx = stack.findIndex((l) => l.route?.path === path);
      expect(idx).toBeGreaterThan(authIdx);
      expect(idx).toBeGreaterThan(scopeIdx);
    }
  });

  it('downloading or viewing a resource of another organization is a 404', async () => {
    prismaMock.libraryResource.findFirst.mockResolvedValue(null);
    for (const fn of [Library.downloadResource, Library.viewResource]) {
      const res = makeRes();
      await fn(reqFor('TEACHER', { params: { id: 'res-1' } }), res);
      expect(res.statusCode).toBe(404);
    }
    expect(prismaMock.libraryResource.findFirst).toHaveBeenCalledWith({ where: { id: 'res-1', organizationId: ORG_A } });
  });

  it('update and delete require owner AND organization and answer 404, not 403', async () => {
    prismaMock.libraryResource.findFirst.mockResolvedValue(null);
    const resU = makeRes();
    await Library.updateResource(reqFor('TEACHER', { params: { id: 'res-1' }, body: { title: 't' } }), resU);
    const resD = makeRes();
    await Library.deleteResource(reqFor('TEACHER', { params: { id: 'res-1' } }), resD);
    expect(resU.statusCode).toBe(404);
    expect(resD.statusCode).toBe(404);
    expect(prismaMock.libraryResource.findFirst).toHaveBeenCalledWith({
      where: { id: 'res-1', uploadedById: U_TEACHER_A, organizationId: ORG_A },
    });
    expect(prismaMock.libraryResource.update).not.toHaveBeenCalled();
    expect(prismaMock.libraryResource.delete).not.toHaveBeenCalled();
  });
});

describe('academic groups', () => {
  it('removing a student id that belongs to another group is a 404', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ id: 'g1' });
    prismaMock.groupStudent.deleteMany.mockResolvedValue({ count: 0 });
    const res = makeRes();
    await Group.deleteStudent(reqFor('TEACHER', { params: { id: 'g1', studentId: 'foreign-student' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.groupStudent.deleteMany).toHaveBeenCalledWith({ where: { id: 'foreign-student', groupId: 'g1' } });
    expect(prismaMock.groupStudent.delete).not.toHaveBeenCalled();
  });

  it('cannot attach another organization class to a group', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ id: 'g1' });
    prismaMock.class.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await Group.updateGroup(reqFor('TEACHER', { params: { id: 'g1' }, body: { name: 'n', classId: 'foreign-class' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prismaMock.group.update).not.toHaveBeenCalled();
  });

  it('cannot link a roster entry from another organization when adding students', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ id: 'g1' });
    prismaMock.classStudent.count.mockResolvedValue(0);
    const res = makeRes();
    await Group.addStudent(
      reqFor('TEACHER', { params: { id: 'g1' }, body: { name: 'n', rollNo: '1', email: 'e@example.test', classStudentId: 'foreign-cs' } }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(prismaMock.groupStudent.create).not.toHaveBeenCalled();
  });

  it('createGroup validates roster links before creating anything', async () => {
    prismaMock.classStudent.count.mockResolvedValue(0);
    const res = makeRes();
    await Group.createGroup(
      reqFor('TEACHER', { body: { name: 'n', students: [{ name: 's', classStudentId: 'foreign-cs' }] } }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(prismaMock.group.create).not.toHaveBeenCalled();
    expect(prismaMock.communityGroup.create).not.toHaveBeenCalled();
  });
});

describe('attendance and leave', () => {
  it('approving a leave application of another organization is a 404', async () => {
    prismaMock.leaveApplication.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await Attendance.updateLeaveStatus(reqFor('TEACHER', { params: { id: 'leave-1' }, body: { status: 'APPROVED' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.leaveApplication.findFirst).toHaveBeenCalledWith({
      where: { id: 'leave-1', organizationId: ORG_A },
      select: { id: true },
    });
    expect(prismaMock.leaveApplication.update).not.toHaveBeenCalled();
  });

  it('a student cannot read a classmate attendance through ?studentId=', async () => {
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    await Attendance.getStudentAttendance(
      reqFor('STUDENT', { query: { studentId: 'classmate' } }, 'me'),
      makeRes(),
    );
    expect(prismaMock.attendanceRecord.findMany.mock.calls[0][0].where).toMatchObject({ studentId: 'me', organizationId: ORG_A });
  });

  it('a teacher can read a student of their own organization only', async () => {
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    await Attendance.getStudentAttendance(reqFor('TEACHER', { query: { studentId: 'pupil' } }), makeRes());
    expect(prismaMock.attendanceRecord.findMany.mock.calls[0][0].where).toMatchObject({ studentId: 'pupil', organizationId: ORG_A });
  });

  it('marking attendance for a student outside the organization is rejected before any write', async () => {
    prismaMock.user.count.mockResolvedValue(0);
    const res = makeRes();
    // markAttendance resolves a class first; provide the minimum prisma surface it needs.
    (prismaMock as any).class.findFirst.mockResolvedValue({ id: 'c1' });
    await Attendance.markAttendance(
      reqFor('TEACHER', {
        body: { classId: 'c1', date: '2026-01-05', attendance: [{ studentId: 'foreign-student', status: 'PRESENT' }] },
      }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(prismaMock.user.count).toHaveBeenCalledWith({ where: { id: { in: ['foreign-student'] }, organizationId: ORG_A } });
  });

  it('the teacher attendance route never updates or creates records for foreign students', async () => {
    const layer = (teacherRouter as any).stack.find((l: any) => l.route?.path === '/attendance' && l.route.methods.post);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    prismaMock.class.findFirst.mockResolvedValue({ id: 'c1' });
    prismaMock.user.count.mockResolvedValue(0);
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const res = makeRes();
    await handler(
      reqFor('TEACHER', { body: { date, subject: 'Maths', records: [{ studentId: 'foreign-student', status: 'PRESENT' }] } }),
      res,
      vi.fn(),
    );
    // asyncHandler does not return the handler promise; wait for the response.
    await vi.waitFor(() => expect(res.statusCode).toBe(404));
    expect(prismaMock.attendanceRecord.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.attendanceRecord.update).not.toHaveBeenCalled();
    expect(prismaMock.attendanceRecord.create).not.toHaveBeenCalled();
  });
});

describe('assessments', () => {
  it('students never see DRAFT assessments, staff still do', async () => {
    prismaMock.assessment.findMany.mockResolvedValue([]);
    await Assessment.getAssessments(reqFor('STUDENT', { authScope: { organizationId: ORG_A } }), makeRes());
    expect(prismaMock.assessment.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG_A, status: { not: 'DRAFT' } });

    prismaMock.assessment.findMany.mockClear();
    await Assessment.getAssessments(reqFor('TEACHER', { authScope: { organizationId: ORG_A } }), makeRes());
    expect(prismaMock.assessment.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG_A });
  });
});
