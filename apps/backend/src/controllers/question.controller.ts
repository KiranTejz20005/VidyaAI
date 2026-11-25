import { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { logger } from '../utils/logger';
import { getRequestOrgId, isAdminRole, isSuperAdmin } from '../security/request-context';

const MAX_QUESTIONS_PER_PAGE = 100;

/**
 * Questions visible to the caller: those of their organization, plus their own
 * legacy questions that predate organization tagging. Only a SUPER_ADMIN
 * without a selected organization sees every tenant.
 */
function questionReadWhere(req: Request): Prisma.QuestionWhereInput {
  const orgId = getRequestOrgId(req);
  if (isSuperAdmin(req.user?.role) && !orgId) return {};
  const ownLegacy: Prisma.QuestionWhereInput = { organizationId: null, authorId: req.user?.id ?? '' };
  return orgId ? { OR: [{ organizationId: orgId }, ownLegacy] } : ownLegacy;
}

/** Questions the caller may change: visible ones they authored, or any visible one for an admin. */
function questionWriteWhere(req: Request): Prisma.QuestionWhereInput {
  if (isAdminRole(req.user?.role)) return questionReadWhere(req);
  return { AND: [questionReadWhere(req), { authorId: req.user?.id ?? '' }] };
}

export const createQuestion = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { content, options, answer, subjectId, unitId, difficulty, bloomLevel } = req.body;

    if (!content || !answer) {
      res.status(400).json({ success: false, error: 'Content and answer are required' });
      return;
    }

    const question = await prisma.question.create({
      data: {
        content,
        options,
        answer,
        subjectId,
        unitId,
        difficulty,
        bloomLevel,
        author: {
          connect: { id: req.user.id }
        },
        ...(getRequestOrgId(req) ? { organization: { connect: { id: getRequestOrgId(req) as string } } } : {}),
      }
    });

    res.status(201).json({ success: true, data: question });
  } catch (error) {
    logger.error({ err: error }, '[createQuestion]');
    res.status(500).json({ success: false, error: 'Failed to create question' });
  }
};

export const getQuestions = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(MAX_QUESTIONS_PER_PAGE, Math.max(1, Number(req.query.limit) || MAX_QUESTIONS_PER_PAGE));
    const page = Math.max(1, Number(req.query.page) || 1);
    const questions = await prisma.question.findMany({
      where: questionReadWhere(req),
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: { firstName: true, lastName: true } }
      }
    });
    res.json({ success: true, data: questions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch questions' });
  }
};

export const getQuestionById = async (req: Request, res: Response) => {
  try {
    const question = await prisma.question.findFirst({
      where: { id: req.params.id, ...questionReadWhere(req) },
      include: {
        author: { select: { firstName: true, lastName: true } }
      }
    });
    if (!question) {
      res.status(404).json({ success: false, error: 'Question not found' });
      return;
    }
    res.json({ success: true, data: question });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch question' });
  }
};

export const updateQuestion = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const allowedRoles = ['TEACHER', 'FACULTY', 'ADMIN', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient privileges' });
      return;
    }

    const { content, options, answer, difficulty, bloomLevel } = req.body;
    const existing = await prisma.question.findFirst({
      where: { id: req.params.id, ...questionWriteWhere(req) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Question not found' });
      return;
    }
    const question = await prisma.question.update({
      where: { id: existing.id },
      data: { content, options, answer, difficulty, bloomLevel }
    });
    res.json({ success: true, data: question });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update question' });
  }
};

export const deleteQuestion = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const allowedRoles = ['TEACHER', 'FACULTY', 'ADMIN', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient privileges' });
      return;
    }

    const existing = await prisma.question.findFirst({
      where: { id: req.params.id, ...questionWriteWhere(req) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Question not found' });
      return;
    }
    await prisma.question.delete({
      where: { id: existing.id }
    });
    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete question' });
  }
};

export const checkDuplicateQuestion = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { content, options, answer, subjectId, candidates } = req.body;

    if (!content) {
      res.status(400).json({ success: false, error: 'Question content is required' });
      return;
    }

    const orgId = getRequestOrgId(req);

    let candidateQuestions: Array<{ id: string; content: string; options?: string[]; answer?: string }> = Array.isArray(candidates) ? candidates : [];

    if (candidateQuestions.length === 0 && orgId) {
      const dbQuestions = await prisma.question.findMany({
        where: {
          organizationId: orgId,
          ...(subjectId && { subjectId }),
        },
        select: {
          id: true,
          content: true,
          options: true,
          answer: true,
        },
        take: 200,
        orderBy: { createdAt: 'desc' },
      });

      candidateQuestions = dbQuestions.map((q) => ({
        id: q.id,
        content: q.content,
        options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
        answer: q.answer || undefined,
      }));
    }

    const { DuplicateDetectionService } = await import('../services/duplicate-detection.service');
    const result = await DuplicateDetectionService.evaluateQuestionDuplicates(
      { content, options, answer, subjectId, organizationId: orgId },
      candidateQuestions,
      orgId
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ err: error }, '[checkDuplicateQuestion]');
    res.status(500).json({
      success: false,
      error: 'Failed to perform duplicate detection check',
    });
  }
};
