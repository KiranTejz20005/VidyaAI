import { describe, it, expect } from 'vitest';
import {
  applyBulkAssessmentSubmissionResult,
  deriveBulkAssessmentJobState,
  BULK_ASSESSMENT_STATUS_PREFIX,
  serializeBulkJobMeta,
  parseBulkJobMeta,
} from '../queues/assessment.queue';

describe('bulk assessment meta helpers', () => {
  it('round-trips serialize/parse', () => {
    const meta = { total: 10, completed: 3, failed: 1, errors: ['a: err'] };
    expect(parseBulkJobMeta(serializeBulkJobMeta(meta))).toEqual(meta);
  });

  it('increments completed on success', () => {
    const base = { total: 2, completed: 0, failed: 0, errors: [] as string[] };
    const next = applyBulkAssessmentSubmissionResult(base, 'sub-1', true);
    expect(next.completed).toBe(1);
    expect(next.failed).toBe(0);
  });

  it('increments failed and appends error', () => {
    const base = { total: 2, completed: 0, failed: 0, errors: [] as string[] };
    const next = applyBulkAssessmentSubmissionResult(base, 'sub-1', false, 'boom');
    expect(next.completed).toBe(0);
    expect(next.failed).toBe(1);
    expect(next.errors).toEqual(['sub-1: boom']);
  });

  it('derives completed status when all done', () => {
    const meta = { total: 2, completed: 2, failed: 0, errors: [] as string[] };
    const state = deriveBulkAssessmentJobState(meta);
    expect(state.finished).toBe(true);
    expect(state.status).toBe(`${BULK_ASSESSMENT_STATUS_PREFIX}completed`);
    expect(state.progress).toBe(100);
  });

  it('derives failed status when all failed', () => {
    const meta = { total: 2, completed: 0, failed: 2, errors: ['x'] };
    const state = deriveBulkAssessmentJobState(meta);
    expect(state.status).toBe(`${BULK_ASSESSMENT_STATUS_PREFIX}failed`);
  });
});