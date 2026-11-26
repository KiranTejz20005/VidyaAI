import { Queue } from 'bullmq';
import { getBullRedisClient } from '../config/redis';
import prisma from '../config/prisma';

export const ASSESSMENT_QUEUE_NAME = 'assessment';

/** Until schema adds BulkAssessmentJob / metadata Json, bulk progress is stored in GenerationJob.error as BULK_META:{...} */
export const BULK_ASSESSMENT_STATUS_PREFIX = 'bulk_assessment:';

export interface BulkAssessmentMeta {
  total: number;
  completed: number;
  failed: number;
  errors: string[];
}

export interface BulkAssessmentCoordinatorData {
  kind: 'coordinator';
  jobRecordId: string;
  assignmentId: string;
  organizationId: string;
  submissionIds: string[];
  force?: boolean;
}

export interface BulkAssessmentSubmissionData {
  kind: 'submission';
  jobRecordId: string;
  assignmentId: string;
  organizationId: string;
  submissionId: string;
  force?: boolean;
}

export type AssessmentJobData = BulkAssessmentCoordinatorData | BulkAssessmentSubmissionData;

const BULK_META_TAG = 'BULK_META:';

export function serializeBulkJobMeta(meta: BulkAssessmentMeta): string {
  return `${BULK_META_TAG}${JSON.stringify(meta)}`;
}

export function parseBulkJobMeta(error: string | null | undefined): BulkAssessmentMeta | null {
  if (!error?.startsWith(BULK_META_TAG)) return null;
  try {
    const parsed = JSON.parse(error.slice(BULK_META_TAG.length)) as BulkAssessmentMeta;
    if (
      typeof parsed.total === 'number' &&
      typeof parsed.completed === 'number' &&
      typeof parsed.failed === 'number' &&
      Array.isArray(parsed.errors)
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export const EMPTY_BULK_ASSESSMENT_META: BulkAssessmentMeta = {
  total: 0,
  completed: 0,
  failed: 0,
  errors: [],
};

export interface BulkAssessmentJobState {
  status: string;
  progress: number;
  finished: boolean;
}

/** Pure: apply one submission outcome to bulk counters (for tests and locked updates). */
export function applyBulkAssessmentSubmissionResult(
  meta: BulkAssessmentMeta,
  submissionId: string,
  ok: boolean,
  errMsg?: string,
): BulkAssessmentMeta {
  return {
    ...meta,
    completed: meta.completed + (ok ? 1 : 0),
    failed: meta.failed + (ok ? 0 : 1),
    errors: ok
      ? meta.errors
      : [...meta.errors.slice(-49), `${submissionId}: ${errMsg ?? 'failed'}`],
  };
}

export function deriveBulkAssessmentJobState(meta: BulkAssessmentMeta): BulkAssessmentJobState {
  const finished = meta.completed + meta.failed >= meta.total;
  const progress = meta.total > 0 ? ((meta.completed + meta.failed) / meta.total) * 100 : 100;
  const status = finished
    ? meta.failed > 0 && meta.completed === 0
      ? `${BULK_ASSESSMENT_STATUS_PREFIX}failed`
      : `${BULK_ASSESSMENT_STATUS_PREFIX}completed`
    : `${BULK_ASSESSMENT_STATUS_PREFIX}processing`;
  return { status, progress, finished };
}

export interface BulkAssessmentJobWrite {
  status: string;
  meta: BulkAssessmentMeta;
  progress: number;
  done?: boolean;
}

/**
 * Runs fn after locking the GenerationJob row (SELECT FOR UPDATE) so concurrent workers
 * cannot lose counter updates on the error BULK_META payload.
 */
export async function withLockedBulkAssessmentJob(
  jobRecordId: string,
  fn: (ctx: { status: string; meta: BulkAssessmentMeta }) => BulkAssessmentJobWrite | null | undefined,
): Promise<boolean> {
  let wrote = false;
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ status: string; error: string | null }>>`
      SELECT status, error FROM "GenerationJob" WHERE id = ${jobRecordId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return;

    const meta = parseBulkJobMeta(row.error) ?? { ...EMPTY_BULK_ASSESSMENT_META };
    const next = fn({ status: row.status, meta });
    if (!next) return;

    const progress = Math.min(100, Math.max(0, Math.round(next.progress)));
    await tx.generationJob.update({
      where: { id: jobRecordId },
      data: {
        status: next.status,
        progress,
        error: serializeBulkJobMeta(next.meta),
        ...(next.done ? { completedAt: new Date() } : {}),
      },
    });
    wrote = true;
  });
  return wrote;
}

export function mapBulkStatusForDto(status: string): 'queued' | 'processing' | 'completed' | 'failed' {
  const stage = status.startsWith(BULK_ASSESSMENT_STATUS_PREFIX)
    ? status.slice(BULK_ASSESSMENT_STATUS_PREFIX.length)
    : status;
  if (stage === 'queued') return 'queued';
  if (stage === 'processing') return 'processing';
  if (stage === 'completed') return 'completed';
  if (stage === 'failed') return 'failed';
  return 'processing';
}

let assessmentQueue: Queue<AssessmentJobData> | null = null;

export function getAssessmentQueue(): Queue<AssessmentJobData> {
  if (!assessmentQueue) {
    assessmentQueue = new Queue<AssessmentJobData>(ASSESSMENT_QUEUE_NAME, {
      connection: getBullRedisClient(),
      skipVersionCheck: true,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return assessmentQueue;
}