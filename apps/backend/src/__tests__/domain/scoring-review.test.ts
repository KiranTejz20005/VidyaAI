import { describe, it, expect } from 'vitest';
import {
  scoreAnswer,
  routeForReview,
  canBulkApprove,
  DEFAULT_REVIEW_POLICY,
  type RubricCriterion,
} from '../../domain/scoring';

const criteria: RubricCriterion[] = [
  { id: 'c1', name: 'Accuracy', maxMarks: 4 },
  { id: 'c2', name: 'Working', maxMarks: 2 },
];

describe('scoreAnswer — caps and issues', () => {
  it('clamps awards above per-criterion max and records issues', () => {
    const result = scoreAnswer(criteria, [
      { criterionId: 'c1', marksAwarded: 10, rationale: 'x', confidence: 0.9 },
      { criterionId: 'c2', marksAwarded: 1, rationale: 'y', confidence: 0.9 },
    ]);

    expect(result.perCriterion[0].awarded).toBe(4);
    expect(result.total).toBe(5);
    expect(result.issues.some((i) => /exceeds the maximum/i.test(i))).toBe(true);
  });

  it('applies total cap and adds an issue when total exceeds cap', () => {
    const result = scoreAnswer(
      criteria,
      [
        { criterionId: 'c1', marksAwarded: 3, rationale: 'a', confidence: 1 },
        { criterionId: 'c2', marksAwarded: 2, rationale: 'b', confidence: 1 },
      ],
      { cap: 4 },
    );

    expect(result.total).toBe(4);
    expect(result.issues.some((i) => /exceeds the cap/i.test(i))).toBe(true);
  });
});

describe('routeForReview', () => {
  it('routes to NEEDS_REVIEW when OCR confidence is below policy threshold', () => {
    const routing = routeForReview({
      ocrConfidence: 0.5,
      matchConfidence: 0.95,
      gradingConfidence: 0.9,
      aiOutputValid: true,
      scoreIssues: [],
    });

    expect(routing.status).toBe('NEEDS_REVIEW');
    expect(routing.reasons.some((r) => /Handwriting recognition confidence/i.test(r))).toBe(true);
  });

  it('returns AUTO_ACCEPTABLE when all signals meet defaults', () => {
    const routing = routeForReview({
      ocrConfidence: DEFAULT_REVIEW_POLICY.minOcrConfidence,
      matchConfidence: DEFAULT_REVIEW_POLICY.minMatchConfidence,
      gradingConfidence: DEFAULT_REVIEW_POLICY.minGradingConfidence,
      aiOutputValid: true,
      scoreIssues: [],
    });

    expect(routing.status).toBe('AUTO_ACCEPTABLE');
    expect(routing.reasons).toHaveLength(0);
  });
});

describe('canBulkApprove', () => {
  it('returns false when routing is NEEDS_REVIEW', () => {
    expect(
      canBulkApprove({
        status: 'AI_SCORED',
        routing: 'NEEDS_REVIEW',
        hasOpenIssues: false,
      }),
    ).toBe(false);
  });

  it('returns true only for AI_SCORED + AUTO_ACCEPTABLE without open issues', () => {
    expect(
      canBulkApprove({
        status: 'AI_SCORED',
        routing: 'AUTO_ACCEPTABLE',
        hasOpenIssues: false,
      }),
    ).toBe(true);

    expect(
      canBulkApprove({
        status: 'AI_SCORED',
        routing: 'AUTO_ACCEPTABLE',
        hasOpenIssues: true,
      }),
    ).toBe(false);
  });
});