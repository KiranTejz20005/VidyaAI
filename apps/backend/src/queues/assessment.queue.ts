import { Queue } from 'bullmq';
import { getBullRedisClient } from '../config/redis';

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