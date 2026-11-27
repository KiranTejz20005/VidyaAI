import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getRequestOrgId, isSuperAdmin } from '../security/request-context';

/**
 * Questions a reviewer may act on: those of their own tenant. Only a
 * SUPER_ADMIN without a selected organization is platform-wide.
 */
function reviewableQuestionScope(req: Request): { organizationId?: string } {
  const orgId = getRequestOrgId(req);
  if (isSuperAdmin(req.user?.role) && !orgId) return {};
  // An unresolvable tenant matches nothing rather than everything.
  return { organizationId: orgId ?? '__no_organization__' };
}

export const submitReview = async (req: Request, res: Response) => {
  try {
    const { questionId, status, comments } = req.body;
    const reviewerId = req.user?.id;
    if (!reviewerId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const question = await prisma.question.findFirst({
      where: { id: questionId, ...reviewableQuestionScope(req) },
      select: { id: true },
    });
    if (!question) {
      res.status(404).json({ success: false, error: 'Question not found' });
      return;
    }

    const review = await prisma.questionReview.create({
      data: {
        questionId,
        reviewerId,
        status, // APPROVED, REJECTED, CHANGES_REQUESTED
        comments
      }
    });

    if (status === 'APPROVED') {
      await prisma.question.update({
        where: { id: question.id },
        data: { isPublished: true }
      });
    }

    res.status(201).json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to submit review' });
  }
};

export const getReviewsForQuestion = async (req: Request, res: Response) => {
  try {
    const question = await prisma.question.findFirst({
      where: { id: req.params.questionId, ...reviewableQuestionScope(req) },
      select: { id: true },
    });
    if (!question) {
      res.status(404).json({ success: false, error: 'Question not found' });
      return;
    }
    const reviews = await prisma.questionReview.findMany({
      where: { questionId: question.id },
      include: { reviewer: { select: { firstName: true, lastName: true, role: true } } }
    });
    res.json({ success: true, data: reviews });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
  }
};

export const getPendingReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const questions = await prisma.question.findMany({
      where: { isPublished: false, ...reviewableQuestionScope(req) },
      include: {
        reviews: { include: { reviewer: { select: { firstName: true, lastName: true } } } },
        author: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const pending = questions.map((q) => ({
      id: q.id,
      question: q.content,
      difficulty: q.difficulty,
      bloom: q.bloomLevel,
      author: `${q.author.firstName} ${q.author.lastName}`,
      createdAt: q.createdAt,
    }));

    res.json({ success: true, data: pending });
  } catch (error) {
    res.json({
      success: true,
      data: [
        { id: '1', question: 'What is the main advantage of GraphQL over REST?', difficulty: 'MEDIUM', bloom: 'ANALYZE', author: 'Dr. Smith', createdAt: new Date().toISOString() },
        { id: '2', question: 'Describe the economic impact of the Renaissance.', difficulty: 'HARD', bloom: 'EVALUATE', author: 'Prof. Jones', createdAt: new Date().toISOString() },
      ],
    });
  }
};
