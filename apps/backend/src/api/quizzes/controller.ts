import { randomBytes, randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../common/response';
import { ApiError } from '../common/errors';
import { parsePagination, buildPagination } from '../common/pagination';
import { getRequestUserId, getRequestOrgId } from '../../security/request-context';
import { generateMultipleQuestions } from '../../services/question-generation.service';
import { AdaptiveQuizService } from '../../services/adaptive-quiz.service';
import { QuizAnalyticsService } from '../../services/quiz-analytics.service';
import prisma from '../../config/prisma';
import {
  serializeQuizSession,
  serializeQuizQuestion,
  serializeQuizHistory,
} from './serializers';

import { getStorageAdapter } from '../../services/storage';

interface QuizAttempt {
  questionId: string;
  answer: string;
  isCorrect: boolean;
}

function normalizeAnswer(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Reads the server-recorded attempts stored on a session. */
function readAttempts(raw: unknown): QuizAttempt[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is QuizAttempt =>
      Boolean(a) && typeof a === 'object' && typeof (a as QuizAttempt).questionId === 'string',
  );
}

/** Score is always derived from the answers the server graded, never taken from the client. */
function scoreFromAttempts(attempts: QuizAttempt[]): number {
  return attempts.filter((a) => a.isCorrect === true).length;
}

export const generateQuiz = async (req: Request, res: Response): Promise<void> => {
  const { topic, subject, difficulty, bloomLevel, count } = req.body;
  const orgId = getRequestOrgId(req);
  const userId = getRequestUserId(req);

  const questions = await generateMultipleQuestions({
    topic,
    subject,
    difficulty,
    bloomLevel: bloomLevel ?? 'APPLY',
    count,
    organizationId: orgId,
  });

  // Persist generated quiz questions to Cloudflare R2 in quizzes/ folder
  const quizId = `quiz-${randomUUID()}`;
  const storageKey = `quizzes/${quizId}.json`;
  try {
    const storage = getStorageAdapter();
    const payload = Buffer.from(JSON.stringify({
      quizId,
      topic,
      subject,
      difficulty,
      bloomLevel: bloomLevel ?? 'APPLY',
      count: questions.length,
      questions,
      createdBy: userId,
      organizationId: orgId,
      generatedAt: new Date().toISOString(),
    }, null, 2));
    await storage.save(storageKey, payload, 'application/json');
  } catch (err) {
    // Non-blocking log
  }

  sendCreated(res, { questions, count: questions.length, storageKey });
};

export const listSessions = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const { page, limit } = parsePagination(req);
  const { status } = req.query as Record<string, string | undefined>;

  const where: any = { userId };
  if (status) where.status = status;

  const [sessions, total] = await Promise.all([
    prisma.quizSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.quizSession.count({ where }),
  ]);

  sendSuccess(res, {
    data: sessions.map(serializeQuizSession),
    pagination: buildPagination(page, limit, total),
  });
};

export const createSession = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const { topic, subject, difficulty, totalQuestions } = req.body;
  const orgId = getRequestOrgId(req);

  const session = await (prisma as any).quizSession.create({
    data: {
      userId,
      topic,
      subject,
      difficulty,
      organizationId: orgId ?? null,
      totalQuestions: totalQuestions ?? 10,
      masteryLevel: 0,
      status: 'IN_PROGRESS',
    },
  });

  sendCreated(res, serializeQuizSession(session));
};

export const getSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = getRequestUserId(req);

  const session = await prisma.quizSession.findFirst({
    where: { id, userId },
    include: { questions: { orderBy: { questionIndex: 'asc' } } },
  });

  if (!session) {
    throw ApiError.notFound('Quiz session not found');
  }

  sendSuccess(res, { data: serializeQuizSession(session) });
};

export const updateSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = getRequestUserId(req);

  const existing = await prisma.quizSession.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound('Quiz session not found');

  // Clients may only report elapsed time; the score is recomputed from the
  // attempts the server has graded so it cannot be set directly.
  const updated = await prisma.quizSession.update({
    where: { id },
    data: {
      ...(req.body.timeSpent !== undefined ? { timeTakenSeconds: Math.round(req.body.timeSpent) } : {}),
      score: scoreFromAttempts(readAttempts(existing.attempts)),
    },
  });

  sendSuccess(res, { data: serializeQuizSession(updated) });
};

export const deleteSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = getRequestUserId(req);

  const existing = await prisma.quizSession.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound('Quiz session not found');

  await prisma.quizSessionQuestion.deleteMany({ where: { sessionId: id } });
  await prisma.quizSession.delete({ where: { id } });

  sendNoContent(res);
};

export const getHistory = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const { page, limit, sort, order } = parsePagination(req);

  const where = { userId, status: 'COMPLETED' as const } as any;

  const [sessions, total] = await Promise.all([
    prisma.quizSession.findMany({
      where,
      orderBy: { [sort]: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.quizSession.count({ where }),
  ]);

  sendSuccess(res, {
    data: sessions.map(serializeQuizHistory),
    pagination: buildPagination(page, limit, total),
  });
};

export const clearHistory = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);

  const sessions = await (prisma as any).quizSession.findMany({
    where: { userId, status: 'COMPLETED' },
    select: { id: true },
  });

  const sessionIds = sessions.map((s: any) => s.id);
  if (sessionIds.length > 0) {
    await prisma.quizSessionQuestion.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.quizSession.deleteMany({ where: { id: { in: sessionIds } } });
  }

  sendNoContent(res);
};

export const shareQuiz = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const { sessionId } = req.body;

  const session = await prisma.quizSession.findFirst({
    where: { id: sessionId, userId },
    include: { questions: true },
  });
  if (!session) throw ApiError.notFound('Quiz session not found');

  const shareToken = `share_${randomBytes(24).toString('base64url')}`;

  sendCreated(res, {
    shareToken,
    shareUrl: `/api/v1/quizzes/shared/${shareToken}`,
  });
};

export const getSharedQuiz = async (_req: Request, _res: Response): Promise<void> => {
  throw ApiError.notFound('Shared quiz not found or expired');
};

export const startAdaptiveQuiz = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const { topic, subject, initialDifficulty } = req.body;
  const orgId = getRequestOrgId(req);

  const session = await (prisma as any).quizSession.create({
    data: {
      userId,
      topic,
      subject,
      difficulty: initialDifficulty ?? 'MEDIUM',
      organizationId: orgId ?? null,
      totalQuestions: 0,
      masteryLevel: 0,
      status: 'IN_PROGRESS',
    },
  });

  const firstQuestion = await AdaptiveQuizService.generateAdaptiveQuestion(session.id);

  sendCreated(res, {
    session: serializeQuizSession({ ...session, questions: [firstQuestion] }),
    currentQuestion: serializeQuizQuestion(firstQuestion),
  });
};

export const getNextAdaptiveQuestion = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const { sessionId, lastQuestionId, lastAnswer } = req.body;

  const session = await prisma.quizSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) throw ApiError.notFound('Quiz session not found');

  let attempts = readAttempts(session.attempts);
  if (lastQuestionId && lastAnswer) {
    const lastQuestion = await prisma.quizSessionQuestion.findFirst({
      where: { id: lastQuestionId, sessionId: session.id },
      select: { id: true, answer: true },
    });
    if (!lastQuestion) throw ApiError.notFound('Quiz question not found');

    const attempt: QuizAttempt = {
      questionId: lastQuestion.id,
      answer: String(lastAnswer),
      isCorrect: normalizeAnswer(lastAnswer) === normalizeAnswer(lastQuestion.answer),
    };
    attempts = [...attempts.filter((a) => a.questionId !== lastQuestion.id), attempt];
  }

  const nextQuestion = await AdaptiveQuizService.generateAdaptiveQuestion(sessionId);

  await prisma.quizSession.update({
    where: { id: sessionId },
    data: {
      totalQuestions: { increment: 1 },
      attempts: attempts as unknown as object[],
      score: scoreFromAttempts(attempts),
    },
  });

  sendSuccess(res, { data: { question: serializeQuizQuestion(nextQuestion) } });
};

export const completeAdaptiveQuiz = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const { sessionId } = req.body;

  const session = await prisma.quizSession.findFirst({
    where: { id: sessionId, userId },
    include: { questions: true },
  });
  if (!session) throw ApiError.notFound('Quiz session not found');

  const analytics = await QuizAnalyticsService.getSessionAnalytics(sessionId);

  const updated = await (prisma as any).quizSession.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      score: analytics?.masteryLevel ?? session.masteryLevel,
      totalQuestions: session.questions.length,
    },
  });

  sendSuccess(res, {
    data: {
      session: serializeQuizSession(updated),
      analytics,
    },
  });
};
