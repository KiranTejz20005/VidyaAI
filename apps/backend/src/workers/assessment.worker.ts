import { Worker, Job } from 'bullmq';
import { getBullRedisClient } from '../config/redis';
import {
  ASSESSMENT_QUEUE_NAME,
  BULK_ASSESSMENT_STATUS_PREFIX,
  applyBulkAssessmentSubmissionResult,
  deriveBulkAssessmentJobState,
  getAssessmentQueue,
  withLockedBulkAssessmentJob,
  type AssessmentJobData,
} from '../queues/assessment.queue';
import { evaluateSubmission } from '../services/grader.service';
import prisma from '../config/prisma';
import { logger } from '../utils/logger';

let assessmentWorker: Worker<AssessmentJobData> | null = null;

export function getAssessmentWorker(): Worker<AssessmentJobData> | null {
  return assessmentWorker;
}

async function processJob(job: Job<AssessmentJobData>): Promise<void> {
  const data = job.data;

  if (data.kind === 'coordinator') {
    const started = await withLockedBulkAssessmentJob(data.jobRecordId, ({ meta }) => ({
      status: `${BULK_ASSESSMENT_STATUS_PREFIX}processing`,
      meta,
      progress: 0,
    }));
    if (!started) throw new Error(`GenerationJob ${data.jobRecordId} not found`);

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

  const updated = await withLockedBulkAssessmentJob(data.jobRecordId, ({ meta }) => {
    const nextMeta = applyBulkAssessmentSubmissionResult(meta, data.submissionId, ok, errMsg);
    const { status, progress, finished } = deriveBulkAssessmentJobState(nextMeta);
    return { status, meta: nextMeta, progress, done: finished };
  });
  if (!updated) return;

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
