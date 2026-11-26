import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import {
  parseBulkJobMeta,
  serializeBulkJobMeta,
  applyBulkAssessmentSubmissionResult,
  deriveBulkAssessmentJobState,
  mapBulkStatusForDto,
  BULK_ASSESSMENT_STATUS_PREFIX,
  type BulkAssessmentMeta,
  type AssessmentJobData,
} from '../queues/assessment.queue';

/** Simulates serial RMW merges as the locked worker path would apply them. */
function mergeSubmissionsSerial(
  initial: BulkAssessmentMeta,
  outcomes: Array<{ submissionId: string; ok: boolean; errMsg?: string }>,
): BulkAssessmentMeta {
  return outcomes.reduce(
    (meta, { submissionId, ok, errMsg }) =>
      applyBulkAssessmentSubmissionResult(meta, submissionId, ok, errMsg),
    initial,
  );
}

const { capturedProcessor, generationJobQueryRaw, generationJobUpdate, studentSubmissionFindFirst } = vi.hoisted(
  () => ({
    capturedProcessor: {} as { run?: (job: Job<AssessmentJobData>) => Promise<void> },
    generationJobQueryRaw: vi.fn(),
    generationJobUpdate: vi.fn().mockResolvedValue({}),
    studentSubmissionFindFirst: vi.fn(),
  }),
);

vi.mock('bullmq', () => {
  class MockWorker {
    on = vi.fn();
    constructor(_name: string, processor: (job: Job<AssessmentJobData>) => Promise<void>) {
      capturedProcessor.run = processor;
    }
  }
  return { Worker: MockWorker };
});

vi.mock('../config/redis', () => ({
  getBullRedisClient: vi.fn(() => ({})),
}));

vi.mock('../queues/assessment.queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../queues/assessment.queue')>();
  return {
    ...actual,
    getAssessmentQueue: vi.fn(() => ({ add: vi.fn() })),
  };
});

vi.mock('../config/prisma', () => ({
  default: {
    $transaction: (cb: (tx: unknown) => Promise<void>) =>
      cb({
        $queryRaw: (...args: unknown[]) => generationJobQueryRaw(...args),
        generationJob: {
          update: (...args: unknown[]) => generationJobUpdate(...args),
        },
      }),
    studentSubmission: {
      findFirst: (...args: unknown[]) => studentSubmissionFindFirst(...args),
    },
  },
}));

vi.mock('../services/grader.service', () => ({
  evaluateSubmission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('assessment.queue — bulk job meta', () => {
  const sample: BulkAssessmentMeta = {
    total: 10,
    completed: 4,
    failed: 1,
    errors: ['sub-1: timeout'],
  };

  it('round-trips serializeBulkJobMeta / parseBulkJobMeta', () => {
    const wire = serializeBulkJobMeta(sample);
    expect(wire.startsWith('BULK_META:')).toBe(true);
    expect(parseBulkJobMeta(wire)).toEqual(sample);
  });

  it('parseBulkJobMeta rejects malformed or non-meta strings', () => {
    expect(parseBulkJobMeta(null)).toBeNull();
    expect(parseBulkJobMeta('plain error')).toBeNull();
    expect(parseBulkJobMeta('BULK_META:{not-json')).toBeNull();
    expect(parseBulkJobMeta('BULK_META:{"total":1}')).toBeNull();
  });

  it('mapBulkStatusForDto strips bulk_assessment prefix and defaults unknown to processing', () => {
    expect(mapBulkStatusForDto('queued')).toBe('queued');
    expect(mapBulkStatusForDto(`${BULK_ASSESSMENT_STATUS_PREFIX}completed`)).toBe('completed');
    expect(mapBulkStatusForDto(`${BULK_ASSESSMENT_STATUS_PREFIX}failed`)).toBe('failed');
    expect(mapBulkStatusForDto('weird-stage')).toBe('processing');
  });
});

describe('assessment worker — concurrent-safe counter merge (pure)', () => {
  it('accumulates completed and failed across serial merges without losing counts', () => {
    const meta = mergeSubmissionsSerial(
      { total: 3, completed: 0, failed: 0, errors: [] },
      [
        { submissionId: 's1', ok: true },
        { submissionId: 's2', ok: false, errMsg: 'ocr failed' },
        { submissionId: 's3', ok: true },
      ],
    );
    expect(meta).toEqual({
      total: 3,
      completed: 2,
      failed: 1,
      errors: ['s2: ocr failed'],
    });
    const state = deriveBulkAssessmentJobState(meta);
    expect(state.finished).toBe(true);
    expect(state.status).toBe(`${BULK_ASSESSMENT_STATUS_PREFIX}completed`);
    expect(state.progress).toBe(100);
  });

  it('two workers merging in arbitrary order yield the same totals', () => {
    const base: BulkAssessmentMeta = { total: 4, completed: 0, failed: 0, errors: [] };
    const a = applyBulkAssessmentSubmissionResult(base, 'a', true);
    const b = applyBulkAssessmentSubmissionResult(base, 'b', false, 'timeout');
    const order1 = applyBulkAssessmentSubmissionResult(a, 'b', false, 'timeout');
    const order2 = applyBulkAssessmentSubmissionResult(b, 'a', true);
    expect(order1).toEqual(order2);
    expect(order1.completed).toBe(1);
    expect(order1.failed).toBe(1);
  });

  it('deriveBulkAssessmentJobState marks all-failed batches as failed', () => {
    let meta: BulkAssessmentMeta = { total: 2, completed: 0, failed: 0, errors: [] };
    meta = applyBulkAssessmentSubmissionResult(meta, 's1', false, 'boom');
    meta = applyBulkAssessmentSubmissionResult(meta, 's2', false, 'boom');
    const state = deriveBulkAssessmentJobState(meta);
    expect(state.finished).toBe(true);
    expect(state.status).toBe(`${BULK_ASSESSMENT_STATUS_PREFIX}failed`);
  });
});

describe('assessment worker — prisma progress persistence', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedProcessor.run = undefined;
    vi.resetModules();
    const { createAssessmentWorker } = await import('../workers/assessment.worker');
    createAssessmentWorker();
    expect(capturedProcessor.run).toBeDefined();
  });

  it('writes finished status and completedAt when completed + failed >= total', async () => {
    const jobRecordId = 'job-1';
    const baseMeta: BulkAssessmentMeta = { total: 2, completed: 1, failed: 0, errors: [] };

    generationJobQueryRaw.mockResolvedValue([
      {
        status: `${BULK_ASSESSMENT_STATUS_PREFIX}processing`,
        error: serializeBulkJobMeta(baseMeta),
      },
    ]);

    studentSubmissionFindFirst.mockResolvedValue({
      id: 'sub-2',
      status: 'SUBMITTED',
      evaluations: [],
    });

    const job = {
      data: {
        kind: 'submission',
        jobRecordId,
        assignmentId: 'asn-1',
        organizationId: 'org-1',
        submissionId: 'sub-2',
      },
    } as Job<AssessmentJobData>;

    await capturedProcessor.run!(job);

    expect(generationJobUpdate).toHaveBeenCalledTimes(1);
    const updateArg = generationJobUpdate.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: jobRecordId });
    expect(updateArg.data.status).toBe(`${BULK_ASSESSMENT_STATUS_PREFIX}completed`);
    expect(updateArg.data.completedAt).toBeInstanceOf(Date);

    const persisted = parseBulkJobMeta(updateArg.data.error as string);
    expect(persisted).toEqual({
      total: 2,
      completed: 2,
      failed: 0,
      errors: [],
    });
    expect(updateArg.data.progress).toBe(100);
  });
});