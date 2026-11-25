import { Request, Response } from 'express';
import { sendSuccess, sendNotFound } from '../common/response';
import { parsePagination, buildPagination } from '../common/pagination';
import { NotFoundError } from '../common/errors';
import { getRequestOrgId, orgScope, requireRequestOrgId } from '../../security/request-context';

import { LearningIntelligenceService } from '../../services/learning-intelligence.service';
import { AnalyticsService } from '../../services/analytics.service';
import prisma from '../../config/prisma';
import { assertStudentAccess } from './student-access';
import {
  serializeProfile,
  serializePrediction,
  serializeStudyPlan,
  serializeInsight,
} from './serializers';

const PROFILE_SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'masteryLevel'] as const;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function describeVelocity(knowledgeGrowth: number): string {
  if (knowledgeGrowth > 2) return 'Accelerating';
  if (knowledgeGrowth < -2) return 'Declining';
  return 'Stable';
}

/** Roster `Student` row of the caller's organization, or 404. */
async function requireRosterStudent(req: Request, studentId: string): Promise<void> {
  const scope = orgScope(req);
  const student = await prisma.student.findFirst({
    where: { id: studentId, ...(scope.organizationId ? { group: { organizationId: scope.organizationId } } : {}) },
    select: { id: true },
  });
  if (!student) throw new NotFoundError('Student not found');
}

export const listProfiles = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sort, order } = parsePagination(req, PROFILE_SORTABLE_FIELDS);
  const scope = orgScope(req);
  const where = scope.organizationId ? { student: { group: { organizationId: scope.organizationId } } } : {};

  const [profiles, total] = await Promise.all([
    prisma.studentLearningProfile.findMany({
      where,
      orderBy: { [sort]: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.studentLearningProfile.count({ where }),
  ]);

  sendSuccess(res, {
    data: profiles.map(serializeProfile),
    pagination: buildPagination(page, limit, total),
  });
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await assertStudentAccess(req, studentId);

  const profile = await prisma.studentLearningProfile.findUnique({
    where: { studentId },
    include: { predictiveAnalytics: true },
  });

  if (!profile) {
    sendNotFound(res, 'Learning profile not found');
    return;
  }

  const serialized = serializeProfile(profile);
  const readiness = profile.predictiveAnalytics?.examReadiness ?? profile.masteryLevel;
  const enriched = {
    ...serialized,
    overallMasteryScore: Math.round(profile.masteryLevel),
    predictedReadiness: Math.min(100, Math.round(readiness)),
    learningVelocity: describeVelocity(profile.knowledgeGrowth),
    strongConcepts: toStringArray(profile.strongConcepts),
    weakConcepts: toStringArray(profile.weakConcepts),
  };

  sendSuccess(res, { data: enriched });
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await requireRosterStudent(req, studentId);
  const { weakConcepts, masteryLevel } = req.body as { weakConcepts?: string[]; masteryLevel?: number };

  const profile = await prisma.studentLearningProfile.upsert({
    where: { studentId },
    update: {
      ...(weakConcepts !== undefined && { weakConcepts }),
      ...(masteryLevel !== undefined && { masteryLevel }),
    },
    create: { studentId, weakConcepts: weakConcepts ?? [], masteryLevel: masteryLevel ?? 0 },
  });

  sendSuccess(res, { data: serializeProfile(profile), message: 'Profile updated' });
};

export const getPredictions = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await assertStudentAccess(req, studentId);

  const profile = await prisma.studentLearningProfile.findUnique({
    where: { studentId },
    include: { predictiveAnalytics: true },
  });
  if (!profile) {
    sendNotFound(res, 'Learning profile not found');
    return;
  }

  const mastery = profile.masteryLevel || 0;
  const predictive = profile.predictiveAnalytics;
  const weakConcepts = toStringArray(profile.weakConcepts);
  const prediction = {
    predictedScore: Math.min(100, Math.round(predictive?.examReadiness ?? mastery)),
    confidence: predictive ? Math.min(1, Math.max(0, predictive.probabilityOfPassing / 100)) : Math.min(1, Math.max(0, profile.consistencyScore / 100)),
    atRisk: mastery < 40,
    recommendations: weakConcepts.length > 0 ? [`Review: ${weakConcepts.join(', ')}`] : ['Continue current study plan'],
  };

  sendSuccess(res, { data: serializePrediction(prediction) });
};

export const refreshProfile = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await assertStudentAccess(req, studentId);

  const existing = await prisma.studentLearningProfile.findUnique({ where: { studentId }, select: { id: true } });
  if (!existing) {
    sendNotFound(res, 'Learning profile not found');
    return;
  }

  const performance = await AnalyticsService.getStudentPerformance(studentId, getRequestOrgId(req));
  await LearningIntelligenceService.updateMasteryProfile(studentId, performance.averageScore);

  const profile = await prisma.studentLearningProfile.findUnique({ where: { studentId } });
  sendSuccess(res, { data: serializeProfile(profile), message: 'Profile refreshed' });
};

export const getStudyPlans = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await assertStudentAccess(req, studentId);

  const primaryPlan = await prisma.personalizedStudyPlan.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });

  if (!primaryPlan) {
    sendSuccess(res, { data: null, message: 'No study plan generated yet' });
    return;
  }

  const topics = toStringArray(primaryPlan.recommendedTopics);
  const minutesPerTopic = topics.length > 0 ? Math.max(1, Math.round(primaryPlan.estimatedTimeMins / topics.length)) : 0;
  const dailyPlan = topics.map((topic) => ({
    title: `Review ${topic}`,
    subject: topic,
    chapter: topic,
    estimatedMinutes: minutesPerTopic,
    difficulty: primaryPlan.difficultyTarget,
    type: 'READING',
    learningOutcome: `Strengthen understanding of ${topic}`,
  }));

  sendSuccess(res, {
    data: {
      id: primaryPlan.id,
      studentId,
      title: primaryPlan.title,
      recommendedTopics: topics,
      estimatedTimeMins: primaryPlan.estimatedTimeMins,
      difficultyTarget: primaryPlan.difficultyTarget,
      dailyPlan,
      createdAt: primaryPlan.createdAt,
    },
  });
};

export const generateStudyPlan = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await assertStudentAccess(req, studentId);
  requireRequestOrgId(req);

  const plan = await LearningIntelligenceService.generateStudyPlan(studentId);
  if (!plan) {
    sendNotFound(res, 'Learning profile not found');
    return;
  }

  sendSuccess(res, { data: serializeStudyPlan(plan), message: 'Study plan generated' });
};

export const getInsights = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await assertStudentAccess(req, studentId);

  const performance = await AnalyticsService.getStudentPerformance(studentId, getRequestOrgId(req));

  const insight = {
    studentId,
    averageScore: performance.averageScore,
    growthTrend: performance.growthTrend,
    weakAreas: performance.weakAreas,
    recommendedFocus: performance.suggestedTopics ?? [],
  };

  sendSuccess(res, { data: serializeInsight(insight) });
};

export const identifyAtRisk = async (req: Request, res: Response): Promise<void> => {
  const scope = orgScope(req);
  const thresholds = (req.body as { thresholds?: { minScore?: number } }).thresholds;
  const minScore = thresholds?.minScore ?? 40;

  const profiles = await prisma.studentLearningProfile.findMany({
    where: {
      masteryLevel: { lt: minScore },
      ...(scope.organizationId ? { student: { group: { organizationId: scope.organizationId } } } : {}),
    },
    orderBy: { masteryLevel: 'asc' },
    take: 200,
    include: { student: { select: { id: true, name: true, rollNo: true, groupId: true } } },
  });

  sendSuccess(res, {
    data: {
      threshold: minScore,
      atRiskStudents: profiles.map((p) => ({
        studentId: p.studentId,
        name: p.student.name,
        rollNo: p.student.rollNo,
        groupId: p.student.groupId,
        masteryLevel: p.masteryLevel,
        weakConcepts: toStringArray(p.weakConcepts),
      })),
    },
  });
};
