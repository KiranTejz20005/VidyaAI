import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import {
  createLessonPlan,
  listUserLessonPlans,
  getLessonPlanDetails,
  deleteLessonPlan,
} from '../services/lessons.service';
import prisma from '../config/prisma';
import { getPdfQueue } from '../queues/pdf.queue';
import { getRedisClient } from '../config/redis';
import { getRequestOrgId, getRequestUserId } from '../security/request-context';

/** Redis key for lesson plan PDF job status */
const LP_PDF_KEY = (jobId: string) => `vidya:lessonplan:pdf:${jobId}`;

export const generatePlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, subject, grade, duration, objectives } = req.body;
    if (!title || !subject || !grade || !duration || !objectives) {
      res.status(400).json({ success: false, error: 'All fields are required' });
      return;
    }
    const userId = getRequestUserId(req);

    const plan = await createLessonPlan({
      title,
      subject,
      grade,
      duration,
      objectives,
      userId,
      organizationId: getRequestOrgId(req) ?? null,
    });

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    logger.error(`[generatePlan] ${error}`);
    res.status(500).json({ success: false, error: 'Failed to generate lesson plan' });
  }
};

export const getPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getRequestUserId(req);
    const plans = await listUserLessonPlans(userId);
    res.json({ success: true, data: plans });
  } catch (error) {
    logger.error(`[getPlans] ${error}`);
    res.status(500).json({ success: false, error: 'Failed to fetch lesson plans' });
  }
};

export const getPlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const plan = await getLessonPlanDetails(id, getRequestUserId(req));
    if (!plan) {
      res.status(404).json({ success: false, error: 'Lesson plan not found' });
      return;
    }
    res.json({ success: true, data: plan });
  } catch (error) {
    logger.error(`[getPlan] ${error}`);
    res.status(500).json({ success: false, error: 'Failed to fetch lesson plan details' });
  }
};

export const removePlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await deleteLessonPlan(id, getRequestUserId(req));
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Lesson plan not found' });
      return;
    }
    res.json({ success: true, message: 'Lesson plan deleted' });
  } catch (error) {
    logger.error(`[removePlan] ${error}`);
    res.status(500).json({ success: false, error: 'Failed to delete lesson plan' });
  }
};

export const updatePlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, subject, grade, duration, objectives, content } = req.body;

    const owned = await getLessonPlanDetails(id, getRequestUserId(req));
    if (!owned) {
      res.status(404).json({ success: false, error: 'Lesson plan not found' });
      return;
    }
    const updated = await prisma.lessonPlan.update({
      where: { id: owned.id },
      data: {
        title: title ?? undefined,
        subject: subject ?? undefined,
        grade: grade ?? undefined,
        duration: duration ?? undefined,
        objectives: objectives ?? undefined,
        content: content ?? undefined,
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error(`[updatePlan] ${error}`);
    res.status(500).json({ success: false, error: 'Failed to update lesson plan' });
  }
};

/**
 * POST /api/v1/lessons/:id/export-pdf
 * Enqueues a BullMQ lesson-plan-pdf job and returns the jobId for polling.
 */
export const exportLessonPdf = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    // Only the plan's owner may export it; anything else is reported as missing.
    const plan = userId ? await getLessonPlanDetails(id, userId) : null;
    if (!plan) {
      res.status(404).json({ success: false, error: 'Lesson plan not found' });
      return;
    }

    const jobId = uuidv4();

    // Initialise Redis status immediately so the frontend can poll right away
    await getRedisClient().set(
      LP_PDF_KEY(jobId),
      JSON.stringify({ status: 'queued', pdfUrl: null }),
      'EX',
      3600,
    );

    // Enqueue the BullMQ lesson-plan-pdf job on the existing 'pdf' queue
    const queue = getPdfQueue();
    await queue.add(
      'lesson-plan-pdf',
      {
        type: 'lesson-plan-pdf' as const,
        lessonPlanId: id,
        jobId,
        userId,
      } as any,
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    );

    logger.info(`[exportLessonPdf] Enqueued lesson-plan-pdf job | lessonPlanId=${id} | jobId=${jobId}`);
    res.status(202).json({ success: true, data: { jobId } });
  } catch (error) {
    logger.error(`[exportLessonPdf] ${error}`);
    res.status(500).json({ success: false, error: 'Failed to start PDF generation. Please try again.' });
  }
};

/**
 * GET /api/v1/lessons/pdf-job/:jobId
 * Polls the Redis result written by the BullMQ worker.
 * Returns: { status: 'queued' | 'completed' | 'failed', pdfUrl?: string }
 */
export const getLessonPdfStatus = async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;

  try {
    const raw = await getRedisClient().get(LP_PDF_KEY(jobId));

    if (!raw) {
      // Job not found or TTL expired
      res.status(404).json({ success: false, error: 'PDF job not found or expired. Please export again.' });
      return;
    }

    let result: { status: string; pdfUrl?: string | null; error?: string };
    try {
      result = JSON.parse(raw);
    } catch {
      res.status(500).json({ success: false, error: 'Invalid job state. Please try again.' });
      return;
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`[getLessonPdfStatus] ${error}`);
    res.status(500).json({ success: false, error: 'Failed to check PDF status. Please try again.' });
  }
};
