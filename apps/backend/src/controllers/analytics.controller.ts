import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AnalyticsService } from '../services/analytics.service';
import { getOrSet, CacheKeys, CacheTTL } from '../api/common/cache';
import { AppError, NotFoundError, ValidationError } from '../api/common/errors';
import { getRequestOrgId, orgScope, requireRequestOrgId } from '../security/request-context';
import { assertStudentAccess } from '../api/learning/student-access';
import { logger } from '../utils/logger';

const RECOMMENDATION_TYPES = ['STUDENT', 'CLASS'] as const;
type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

/** Loads a class of the caller's organization or throws 404. */
async function requireClassInScope(req: Request, classId: string): Promise<void> {
  const found = await prisma.class.findFirst({ where: { id: classId, ...orgScope(req) }, select: { id: true } });
  if (!found) throw new NotFoundError('Class not found');
}

export const getDashboardStats = async (req: Request, res: Response) => {
  const orgId = requireRequestOrgId(req);
  try {
    const cacheKey = CacheKeys.ANALYTICS(orgId, 'dashboard');
    const data = await getOrSet(cacheKey, async () => {
      const totalQuestions = await prisma.questionBank.count({
        where: { organizationId: orgId }
      });

      const totalAssessments = await prisma.assignment.count({
        where: { organizationId: orgId }
      });

      // Pending reviews = this organization's student submissions not yet graded
      const pendingReviews = await prisma.studentSubmission.count({
        where: { organizationId: orgId, status: { not: 'GRADED' } }
      });

      const bloomDistribution = await prisma.questionBank.groupBy({
        by: ['bloomLevel'],
        where: { organizationId: orgId },
        _count: { bloomLevel: true }
      });

      const difficultyDistribution = await prisma.questionBank.groupBy({
        by: ['difficulty'],
        where: { organizationId: orgId },
        _count: { difficulty: true }
      });

      const bloomData = bloomDistribution.map((b: any) => ({
        level: b.bloomLevel,
        count: b._count.bloomLevel
      }));

      const difficultyData = difficultyDistribution.map((d: any) => ({
        level: d.difficulty,
        count: d._count.difficulty
      }));

      return {
        totals: {
          questions: totalQuestions,
          assessments: totalAssessments,
          pendingReviews: pendingReviews
        },
        bloomDistribution: bloomData,
        difficultyDistribution: difficultyData
      };
    }, CacheTTL.SHORT);

    res.json({ success: true, data });
  } catch (error) {
    logger.error({ err: error }, '[Analytics:getDashboardStats] failed');
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
};

export const getStudentStats = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await assertStudentAccess(req, studentId);
  try {
    const stats = await AnalyticsService.getStudentPerformance(studentId, getRequestOrgId(req));
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error({ err: error }, '[Analytics:getStudentStats] failed');
    res.status(500).json({ success: false, error: 'Failed to get student stats' });
  }
};

export const getGroupStats = async (req: Request, res: Response): Promise<void> => {
  const { groupId } = req.params;
  await requireClassInScope(req, groupId);
  try {
    const stats = await AnalyticsService.getGroupPerformance(groupId, getRequestOrgId(req));
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error({ err: error }, '[Analytics:getGroupStats] failed');
    res.status(500).json({ success: false, error: 'Failed to get group stats' });
  }
};

export const triggerRecommendations = async (req: Request, res: Response): Promise<void> => {
  const { targetId, type } = req.body ?? {};
  if (typeof targetId !== 'string' || !targetId || !RECOMMENDATION_TYPES.includes(type)) {
    throw new ValidationError('targetId and type (STUDENT or CLASS) are required');
  }
  const recommendationType = type as RecommendationType;

  if (recommendationType === 'STUDENT') {
    await assertStudentAccess(req, targetId);
  } else {
    await requireClassInScope(req, targetId);
  }

  try {
    const rec = await AnalyticsService.generateAIRecommendations(targetId, recommendationType, getRequestOrgId(req));
    res.json({ success: true, data: rec });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error({ err: error }, '[Analytics:triggerRecommendations] failed');
    res.status(500).json({ success: false, error: 'Failed to generate recommendations' });
  }
};
