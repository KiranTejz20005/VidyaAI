import { Worker, Job } from 'bullmq';
import { getBullRedisClient } from '../config/redis';
import {
  ASSESSMENT_QUEUE_NAME,
  BULK_ASSESSMENT_STATUS_PREFIX,
  getAssessmentQueue,
  parseBulkJobMeta,
  serializeBulkJobMeta,
  type AssessmentJobData,
  type BulkAssessmentMeta,
} from '../queues/assessment.queue';
import { evaluateSubmission } from '../services/grader.service';
import prisma from '../config/prisma';
import { logger } from '../utils/logger';

let assessmentWorker: Worker<AssessmentJobData> | null = null;

export function getAssessmentWorker(): Worker<AssessmentJobData> | null {
  return assessmentWorker;
}

async function readMeta(jobRecordId: string): Promise<{ status: string; meta: BulkAssessmentMeta } | null> {
  const row = await prisma.generationJob.findUnique({ where: { id: jobRecordId } });
  if (!row) return null;
  const meta = parseBulkJobMeta(row.error) ?? { total: 0, completed: 0, failed: 0, errors: [] };
  return { status: row.status, meta };
}

async function writeMeta(
  jobRecordId: string,
  status: string,
  meta: BulkAssessmentMeta,
  progress: number,
  done = false,
) {
  await prisma.generationJob.update({
    where: { id: jobRecordId },
    data: {
      status,
      progress: Math.min(100, Math.max(0, Math.round(progress))),
      error: serializeBulkJobMeta(meta),
      ...(done ? { completedAt: new Date() } : {}),
    },
  });
}

async function processJob(job: Job<AssessmentJobData>): Promise<void> {
  const data = job.data;

  if (data.kind === 'coordinator') {
    const current = await readMeta(data.jobRecordId);
    if (!current) throw new Error(`GenerationJob ${data.jobRecordId} not found`);

    await writeMeta(
      data.jobRecordId,
      `${BULK_ASSESSMENT_STATUS_PREFIX}processing`,
      current.meta,
      0,
    );

    const queue = getAssessmentQueue();
    for (const submissionId of data.submissionIds) {
      await queue.add(
        'bulk-assessment-submission',
        {
          kind: 'submission',
          jobRecordId: data.jobRecordId,
          assignmentId: data.assignmentId,
          organizationId: data.organizationId,
          submissionId,
          force: data.force,
        },
        {
          jobId: `bulk-assessment-sub-${data.jobRecordId}-${submissionId}`,
          attempts: 3,
        },
      );
    }
    return;
  }

  // submission job
  const submission = await prisma.studentSubmission.findFirst({
    where: {
      id: data.submissionId,
      assignmentId: data.assignmentId,
      organizationId: data.organizationId,
    },
    include: { evaluations: { select: { teacherOverride: true, isOverridden: true } } },
  });

  let ok = false;
  let errMsg: string | undefined;

  if (!submission) {
    errMsg = `Submission ${data.submissionId} not found in org scope`;
  } else if (
    !data.force &&
    submission.status === 'GRADED' &&
    (submission.evaluations[0]?.isOverridden || submission.evaluations[0]?.teacherOverride)
  ) {
    ok = true; // treat as already done — do not overwrite teacher work
  } else if (!data.force && submission.status === 'GRADED') {
    ok = true;
  } else {
    try {
      await evaluateSubmission(data.submissionId);
      ok = true;
    } catch (err) {
      errMsg = err instanceof Error ? err.message : 'Evaluation failed';
      logger.error({ err, submissionId: data.submissionId }, '[assessment.worker] evaluate failed');
    }
  }

  // Atomic-ish counter update via read-modify-write (acceptable for exam-scale batches)
  const current = await readMeta(data.jobRecordId);
  if (!current) return;

  const meta: BulkAssessmentMeta = {
    ...current.meta,
    completed: current.meta.completed + (ok ? 1 : 0),
    failed: current.meta.failed + (ok ? 0 : 1),
    errors: ok
      ? current.meta.errors
      : [...current.meta.errors.slice(-49), `${data.submissionId}: ${errMsg ?? 'failed'}`],
  };
  const finished = meta.completed + meta.failed >= meta.total;
  const progress = meta.total > 0 ? ((meta.completed + meta.failed) / meta.total) * 100 : 100;
  const status = finished
    ? meta.failed > 0 && meta.completed === 0
      ? `${BULK_ASSESSMENT_STATUS_PREFIX}failed`
      : `${BULK_ASSESSMENT_STATUS_PREFIX}completed`
    : `${BULK_ASSESSMENT_STATUS_PREFIX}processing`;

  await writeMeta(data.jobRecordId, status, meta, progress, finished);

  if (!ok) throw new Error(errMsg ?? 'Evaluation failed');
}

export function createAssessmentWorker(): Worker<AssessmentJobData> {
  if (assessmentWorker) return assessmentWorker;

  assessmentWorker = new Worker<AssessmentJobData>(ASSESSMENT_QUEUE_NAME, processJob, {
    connection: getBullRedisClient(),
    concurrency: 3,
  });

  assessmentWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, '[assessment.worker] job failed');
  });

  return assessmentWorker;
}
