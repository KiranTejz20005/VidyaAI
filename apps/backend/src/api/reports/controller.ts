import { Request, Response } from 'express';
import { sendSuccess, sendNotFound, sendAccepted } from '../common/response';

import { AnalyticsService } from '../../services/analytics.service';
import prisma from '../../config/prisma';
import {
  getRequestOrgId,
  getRequestUserId,
  isAdminRole,
  isStudentRole,
  isSuperAdmin,
  requireRequestOrgId,
} from '../../security/request-context';
import {
  serializeReportJob,
  serializeAssignmentReport,
  serializeStudentReport,
  serializeClassReport,
  serializeOrganizationReport,
  serializeDownloadReport,
} from './serializers';

/**
 * Assignments a caller may report on: confined to their tenant; teachers only
 * their own, admins the whole organization.
 */
function assignmentScope(req: Request): Record<string, unknown> {
  if (isSuperAdmin(req.user?.role) && !getRequestOrgId(req)) return {};
  const scope: Record<string, unknown> = { organizationId: requireRequestOrgId(req) };
  if (!isAdminRole(req.user?.role)) scope.createdById = getRequestUserId(req);
  return scope;
}

export const generateAssignmentReport = async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.body;

  const owned = await prisma.assignment.findFirst({
    where: { id: assignmentId, ...assignmentScope(req) },
    select: { id: true, organizationId: true },
  });
  if (!owned) {
    sendNotFound(res, 'Assignment not found');
    return;
  }

  const job = await prisma.generationJob.create({
    data: {
      assignmentId: owned.id,
      organizationId: owned.organizationId,
      status: 'QUEUED',
      progress: 0,
      progressVersion: 0,
      stageIndex: 0,
      startedAt: new Date(),
    },
  });

  sendAccepted(res, serializeReportJob(job), 'Report generation queued');
};

export const getReportStatus = async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;

  const job = await prisma.generationJob.findFirst({ where: { id: jobId, assignment: assignmentScope(req) } });
  if (!job) {
    sendNotFound(res, 'Report generation job not found');
    return;
  }

  sendSuccess(res, { data: serializeReportJob(job) });
};

export const getAssignmentReport = async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.params;

  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, ...assignmentScope(req) },
    include: { submissions: { include: { evaluations: true } } },
  });

  if (!assignment) {
    sendNotFound(res, 'Assignment not found');
    return;
  }

  const evaluations = assignment.submissions.flatMap((s) => s.evaluations).filter(Boolean);
  const averageScore =
    evaluations.length > 0
      ? evaluations.reduce((sum, e) => sum + (e.score / e.totalMarks) * 100, 0) / evaluations.length
      : 0;

  sendSuccess(res, {
    data: serializeAssignmentReport({
      assignmentId: assignment.id,
      title: assignment.title,
      totalStudents: assignment.submissions.length,
      submittedCount: assignment.submissions.length,
      averageScore: Math.round(averageScore * 100) / 100,
      gradeDistribution: { A: 20, B: 40, C: 25, D: 10, F: 5 },
      questionAnalysis: [],
    }),
  });
};

export const getStudentReport = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;

  // Students may only read their own report; staff only students of their organization.
  if (isStudentRole(req.user?.role)) {
    if (studentId !== getRequestUserId(req)) {
      sendNotFound(res, 'Student not found');
      return;
    }
  } else {
    const student = await prisma.user.findFirst({
      where: { id: studentId, role: 'STUDENT', ...(isSuperAdmin(req.user?.role) && !getRequestOrgId(req) ? {} : { organizationId: requireRequestOrgId(req) }) },
      select: { id: true },
    });
    if (!student) {
      sendNotFound(res, 'Student not found');
      return;
    }
  }

  const performance = await AnalyticsService.getStudentPerformance(studentId);

  sendSuccess(res, {
    data: serializeStudentReport({
      studentId,
      name: 'Student',
      totalAssignments: performance.scoresHistory?.length ?? 0,
      averageScore: performance.averageScore,
      growthTrend: performance.growthTrend,
      topicMastery: performance.topicMastery,
      recommendations: performance.recommendation ? [performance.recommendation] : [],
    }),
  });
};

export const getClassReport = async (req: Request, res: Response): Promise<void> => {
  const { classId } = req.params;

  const classScope: Record<string, unknown> = isSuperAdmin(req.user?.role) && !getRequestOrgId(req)
    ? {}
    : { organizationId: requireRequestOrgId(req) };
  if (!isAdminRole(req.user?.role)) classScope.facultyId = getRequestUserId(req);
  const classData = await prisma.class.findFirst({
    where: { id: classId, ...classScope },
    include: { students: true, faculty: true },
  });

  if (!classData) {
    sendNotFound(res, 'Class not found');
    return;
  }

  const performance = await AnalyticsService.getGroupPerformance(classId);

  sendSuccess(res, {
    data: serializeClassReport({
      classId: classData.id,
      className: `Class ${classData.grade} ${classData.section}`,
      totalStudents: classData.students.length,
      averageScore: performance.averageScore,
      gradeDistribution: performance.distribution,
      topPerformers: performance.topStudents?.map((s: any) => s.name) ?? [],
      atRiskStudents: performance.weakPerformers?.map((s: any) => s.name) ?? [],
    }),
  });
};

export const getOrganizationReport = async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;

  // Only a SUPER_ADMIN may report on an organization other than their own.
  if (!isSuperAdmin(req.user?.role) && orgId !== getRequestOrgId(req)) {
    sendNotFound(res, 'Organization not found');
    return;
  }
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    sendNotFound(res, 'Organization not found');
    return;
  }

  const stats = await AnalyticsService.getAdminAnalytics(orgId);

  sendSuccess(res, {
    data: serializeOrganizationReport({
      orgId: org.id,
      name: org.name,
      totalUsers: stats.totals?.users ?? 0,
      totalTeachers: stats.totals?.teachers ?? 0,
      totalStudents: stats.totals?.students ?? 0,
      totalAssignments: stats.totals?.assignmentsCreated ?? 0,
      averageScore: 75,
      aiUsageTokens: stats.aiAnalytics?.totalTokens ?? 0,
      aiUsageCost: stats.aiAnalytics?.totalCost ?? 0,
    }),
  });
};

export const downloadReport = async (req: Request, res: Response): Promise<void> => {
  const { reportId } = req.params;

  const job = await prisma.generationJob.findFirst({ where: { id: reportId, assignment: assignmentScope(req) } });
  if (!job) {
    sendNotFound(res, 'Report not found');
    return;
  }

  sendSuccess(res, {
    data: serializeDownloadReport({
      id: job.id,
      url: '#',
      format: 'pdf',
      createdAt: job.createdAt,
    }),
  });
};
