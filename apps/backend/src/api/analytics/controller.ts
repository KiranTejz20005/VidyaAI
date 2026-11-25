import { Request, Response } from 'express';
import { sendSuccess, sendBadRequest } from '../common/response';
import { getRequestOrgId, requireRequestOrgId } from '../../security/request-context';
import { AnalyticsService } from '../../services/analytics.service';
import prisma from '../../config/prisma';
import { assertStudentAccess } from '../learning/student-access';
import {
  serializeDashboard,
  serializeAssignmentAnalytics,
  serializeQuizAnalytics,
  serializeStudentPerformance,
  serializeTeacherPerformance,
  serializeUsageStats,
  serializeAiUsage,
} from './serializers';

/** Upper bound on evaluation rows loaded for score aggregation. */
const MAX_SCORE_ROWS = 5000;

type ScoreRow = { score: number; totalMarks: number };

function toPercentage(row: ScoreRow): number {
  return row.totalMarks > 0 ? (row.score / row.totalMarks) * 100 : 0;
}

function gradeDistribution(rows: ScoreRow[]): Record<string, number> {
  const distribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const row of rows) {
    const pct = toPercentage(row);
    if (pct >= 90) distribution.A++;
    else if (pct >= 80) distribution.B++;
    else if (pct >= 70) distribution.C++;
    else if (pct >= 60) distribution.D++;
    else distribution.F++;
  }
  return distribution;
}

function averagePercentage(rows: ScoreRow[]): number {
  if (rows.length === 0) return 0;
  const avg = rows.reduce((sum, r) => sum + toPercentage(r), 0) / rows.length;
  return Math.round(avg * 100) / 100;
}

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  const orgId = requireRequestOrgId(req);

  const stats = await AnalyticsService.getAdminAnalytics(orgId);

  sendSuccess(res, { data: serializeDashboard(stats) });
};

export const getAssignmentAnalytics = async (req: Request, res: Response): Promise<void> => {
  const orgId = requireRequestOrgId(req);

  const [totalAssignments, totalSubmissions, evaluations] = await Promise.all([
    prisma.assignment.count({ where: { organizationId: orgId } }),
    prisma.studentSubmission.count({ where: { organizationId: orgId } }),
    prisma.submissionEvaluation.findMany({
      where: { submission: { organizationId: orgId } },
      select: { score: true, totalMarks: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_SCORE_ROWS,
    }),
  ]);

  const submissionRate = totalAssignments > 0 ? totalSubmissions / totalAssignments : 0;

  sendSuccess(res, {
    data: serializeAssignmentAnalytics({
      totalAssignments,
      averageScore: averagePercentage(evaluations),
      submissionRate: Math.round(submissionRate * 100) / 100,
      gradeDistribution: gradeDistribution(evaluations),
    }),
  });
};

export const getQuizAnalytics = async (req: Request, res: Response): Promise<void> => {
  const orgId = requireRequestOrgId(req);
  const where = { organizationId: orgId };

  const [aggregate, completedQuizzes, bloomGroups] = await Promise.all([
    prisma.quizSession.aggregate({ where, _count: { _all: true }, _avg: { masteryLevel: true } }),
    prisma.quizSession.count({ where: { ...where, timeTakenSeconds: { gt: 0 } } }),
    prisma.quizSessionQuestion.groupBy({
      by: ['bloomLevel'],
      where: { session: where },
      _count: { _all: true },
    }),
  ]);

  const totalQuizzes = aggregate._count._all;
  const averageScore = aggregate._avg.masteryLevel ?? 0;
  const completionRate = totalQuizzes > 0 ? Math.round((completedQuizzes / totalQuizzes) * 100) / 100 : 0;

  const questionDistribution: Record<string, number> = {};
  for (const group of bloomGroups) {
    const level = group.bloomLevel || 'REMEMBER';
    questionDistribution[level] = (questionDistribution[level] || 0) + group._count._all;
  }

  sendSuccess(res, {
    data: serializeQuizAnalytics({
      totalQuizzes,
      averageScore: Math.round(averageScore * 100) / 100,
      completionRate,
      questionDistribution,
    }),
  });
};

export const getStudentPerformance = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.query;

  if (!studentId || typeof studentId !== 'string') {
    sendBadRequest(res, 'studentId query parameter is required');
    return;
  }

  await assertStudentAccess(req, studentId);
  const orgId = getRequestOrgId(req);

  const performance = await AnalyticsService.getStudentPerformance(studentId, orgId);

  sendSuccess(res, { data: serializeStudentPerformance(performance) });
};

export const getTeacherPerformance = async (req: Request, res: Response): Promise<void> => {
  const orgId = requireRequestOrgId(req);

  const teachers = await prisma.user.findMany({
    where: { role: 'TEACHER', organizationId: orgId },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const teacherIds = teachers.map((t) => t.id);

  const [assignmentCounts, paperRows, evaluations] = await Promise.all([
    prisma.assignment.groupBy({
      by: ['createdById'],
      where: { organizationId: orgId, createdById: { in: teacherIds } },
      _count: { _all: true },
    }),
    prisma.generatedPaper.findMany({
      where: { organizationId: orgId, assignment: { createdById: { in: teacherIds } } },
      select: { assignment: { select: { createdById: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_SCORE_ROWS,
    }),
    prisma.submissionEvaluation.findMany({
      where: { submission: { organizationId: orgId, assignment: { createdById: { in: teacherIds } } } },
      select: { score: true, totalMarks: true, submission: { select: { assignment: { select: { createdById: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_SCORE_ROWS,
    }),
  ]);

  const assignmentsByTeacher = new Map<string, number>();
  for (const row of assignmentCounts) {
    if (row.createdById) assignmentsByTeacher.set(row.createdById, row._count._all);
  }

  const papersByTeacher = new Map<string, number>();
  for (const paper of paperRows) {
    const teacherId = paper.assignment.createdById;
    if (teacherId) papersByTeacher.set(teacherId, (papersByTeacher.get(teacherId) ?? 0) + 1);
  }

  const scoresByTeacher = new Map<string, ScoreRow[]>();
  for (const evaluation of evaluations) {
    const teacherId = evaluation.submission.assignment.createdById;
    if (!teacherId) continue;
    const rows = scoresByTeacher.get(teacherId) ?? [];
    rows.push({ score: evaluation.score, totalMarks: evaluation.totalMarks });
    scoresByTeacher.set(teacherId, rows);
  }

  const performance = teachers.map((teacher) =>
    serializeTeacherPerformance({
      teacherId: teacher.id,
      name: `${teacher.firstName} ${teacher.lastName}`,
      totalAssignments: assignmentsByTeacher.get(teacher.id) ?? 0,
      averageClassScore: averagePercentage(scoresByTeacher.get(teacher.id) ?? []),
      papersGenerated: papersByTeacher.get(teacher.id) ?? 0,
    })
  );

  sendSuccess(res, { data: performance });
};

export const getUsageStats = async (req: Request, res: Response): Promise<void> => {
  const orgId = requireRequestOrgId(req);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalRequests, users, lastThirtyDays] = await Promise.all([
    prisma.promptExecution.count({ where: { organizationId: orgId } }),
    prisma.promptExecution.groupBy({ by: ['userId'], where: { organizationId: orgId } }),
    prisma.promptExecution.count({ where: { organizationId: orgId, createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  sendSuccess(res, {
    data: serializeUsageStats({
      totalRequests,
      uniqueUsers: users.length,
      endpointBreakdown: {},
      dailyAverage: Math.round(lastThirtyDays / 30),
    }),
  });
};

export const getAiUsage = async (req: Request, res: Response): Promise<void> => {
  const orgId = requireRequestOrgId(req);
  const stats = await AnalyticsService.getAdminAnalytics(orgId);

  sendSuccess(res, { data: serializeAiUsage(stats.aiAnalytics) });
};
