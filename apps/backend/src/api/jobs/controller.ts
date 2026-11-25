import { Request, Response } from 'express';
import { sendSuccess, sendNotFound, sendNoContent } from '../common/response';
import { parsePagination, buildPagination } from '../common/pagination';
import { getGenerationQueue } from '../../queues/generation.queue';
import prisma from '../../config/prisma';
import { getRequestUserId, normalizeRole, requireRequestOrgId } from '../../security/request-context';
import { serializeJob, serializeCancelResult } from './serializers';

/** Statuses after which a generation job can no longer change. */
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'partial_success'] as const;

/**
 * Every query is confined to the caller's organization through the owning
 * assignment. Teachers only see jobs for assignments they created; admins see
 * the whole organization.
 */
function scopeWhere(req: Request): Record<string, unknown> {
  const orgId = requireRequestOrgId(req);
  const role = normalizeRole(req.user?.role);
  const assignment: Record<string, unknown> = { organizationId: orgId };
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    assignment.createdById = getRequestUserId(req);
  }
  return { assignment };
}

async function findScopedJob(req: Request) {
  return prisma.generationJob.findFirst({ where: { id: req.params.jobId, ...scopeWhere(req) } });
}

export const getJob = async (req: Request, res: Response): Promise<void> => {
  const job = await findScopedJob(req);
  if (!job) {
    sendNotFound(res, 'Job not found');
    return;
  }
  sendSuccess(res, { data: serializeJob(job) });
};

export const listJobs = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sort, order } = parsePagination(req, ['createdAt', 'updatedAt', 'status', 'progress'] as const);
  const { status } = req.query;

  const where: Record<string, unknown> = { ...scopeWhere(req) };
  if (typeof status === 'string' && status) where.status = status;

  const [jobs, total] = await Promise.all([
    prisma.generationJob.findMany({ where, orderBy: { [sort]: order }, skip: (page - 1) * limit, take: limit }),
    prisma.generationJob.count({ where }),
  ]);

  sendSuccess(res, { data: jobs.map(serializeJob), pagination: buildPagination(page, limit, total) });
};

export const cancelJob = async (req: Request, res: Response): Promise<void> => {
  const job = await findScopedJob(req);
  if (!job) {
    sendNotFound(res, 'Job not found');
    return;
  }

  const alreadyDone = (TERMINAL_STATUSES as readonly string[]).includes(job.status);
  if (alreadyDone) {
    sendSuccess(res, { data: serializeCancelResult(job.id, false), message: `Job already ${job.status}` });
    return;
  }

  // Compare-and-set so a job that finished in the meantime is not overwritten.
  const updated = await prisma.generationJob.updateMany({
    where: { id: job.id, status: { notIn: [...TERMINAL_STATUSES] } },
    data: { status: 'cancelled', completedAt: new Date() },
  });

  if (updated.count === 1 && job.bullmqJobId) {
    try {
      const bullJob = await getGenerationQueue().getJob(job.bullmqJobId);
      if (bullJob) await bullJob.remove();
    } catch {
      // The BullMQ job may be active or gone; the database status is authoritative.
    }
  }

  sendSuccess(res, {
    data: serializeCancelResult(job.id, updated.count === 1),
    message: updated.count === 1 ? 'Job cancelled' : 'Job could not be cancelled',
  });
};

export const getJobLogs = async (req: Request, res: Response): Promise<void> => {
  const job = await findScopedJob(req);
  if (!job) {
    sendNotFound(res, 'Job not found');
    return;
  }
  // Per-job logs are not persisted; expose the recorded failure so callers see something real.
  sendSuccess(res, { data: job.error ? [{ id: job.id, jobId: job.id, level: 'error', message: job.error, timestamp: job.updatedAt }] : [] });
};

export const cleanUpJob = async (req: Request, res: Response): Promise<void> => {
  const job = await findScopedJob(req);
  if (!job) {
    sendNotFound(res, 'Job not found');
    return;
  }
  if ((TERMINAL_STATUSES as readonly string[]).includes(job.status)) {
    await prisma.generationJob.delete({ where: { id: job.id } });
  }
  sendNoContent(res);
};
