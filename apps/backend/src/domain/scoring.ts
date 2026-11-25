/**
 * Deterministic rubric scoring, review routing and the evaluation lifecycle.
 *
 * Nothing in here calls an AI model. AI output is validated and then passed
 * through these functions so marks are always bounded, reproducible and
 * explainable, and so uncertain results can never become final on their own.
 */

export const MARK_STEP = 0.25;

export interface RubricCriterion {
  id: string;
  name: string;
  maxMarks: number;
}

export interface CriterionAward {
  criterionId: string;
  marksAwarded: number;
  rationale: string;
  confidence: number;
}

export interface CriterionScore {
  criterionId: string;
  awarded: number;
  max: number;
  /** True when the evaluator returned nothing for this criterion. */
  missing: boolean;
}

export interface ScoreResult {
  total: number;
  max: number;
  perCriterion: CriterionScore[];
  /** Anything that made the raw AI/teacher input need correcting. Non-empty means "look at this". */
  issues: string[];
}

export function roundToStep(value: number, step: number = MARK_STEP): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

/** Returns a list of problems with a rubric; an empty list means it is usable. */
export function validateRubric(criteria: RubricCriterion[], maxMarks: number): string[] {
  const errors: string[] = [];
  if (criteria.length === 0) errors.push('Rubric has no criteria');
  const seen = new Set<string>();
  for (const c of criteria) {
    if (seen.has(c.id)) errors.push(`Duplicate criterion id "${c.id}"`);
    seen.add(c.id);
    if (!(c.maxMarks > 0)) errors.push(`Criterion "${c.name}" must be worth more than 0 marks`);
  }
  const sum = criteria.reduce((acc, c) => acc + c.maxMarks, 0);
  if (Math.abs(sum - maxMarks) > 1e-9) {
    errors.push(`Criteria add up to ${sum} marks but the question is worth ${maxMarks}`);
  }
  return errors;
}

export interface ScoreOptions {
  /** A zero-mark condition from the marking scheme was triggered (e.g. blank or copied answer). */
  zeroMarks?: boolean;
  /** Upper bound imposed by the marking scheme. */
  cap?: number;
}

export function scoreAnswer(
  criteria: RubricCriterion[],
  awards: CriterionAward[],
  options: ScoreOptions = {},
): ScoreResult {
  const issues: string[] = [];
  const byId = new Map<string, CriterionAward>();
  for (const a of awards) {
    if (byId.has(a.criterionId)) issues.push(`Duplicate award for criterion "${a.criterionId}"; the first was used`);
    else byId.set(a.criterionId, a);
  }
  const known = new Set(criteria.map((c) => c.id));
  for (const id of byId.keys()) if (!known.has(id)) issues.push(`Award for unknown criterion "${id}" was ignored`);

  const perCriterion: CriterionScore[] = criteria.map((c) => {
    const award = byId.get(c.id);
    if (!award) {
      issues.push(`No award returned for criterion "${c.name}"`);
      return { criterionId: c.id, awarded: 0, max: c.maxMarks, missing: true };
    }
    let awarded = roundToStep(award.marksAwarded);
    if (awarded > c.maxMarks) {
      issues.push(`"${c.name}": ${award.marksAwarded} exceeds the maximum of ${c.maxMarks} and was clamped`);
      awarded = c.maxMarks;
    }
    if (awarded < 0) {
      issues.push(`"${c.name}": negative marks were clamped to 0`);
      awarded = 0;
    }
    return { criterionId: c.id, awarded, max: c.maxMarks, missing: false };
  });

  const max = criteria.reduce((acc, c) => acc + c.maxMarks, 0);
  let total = perCriterion.reduce((acc, c) => acc + c.awarded, 0);
  if (options.zeroMarks) {
    if (total > 0) issues.push('A zero-mark condition applied; total set to 0');
    total = 0;
  }
  if (options.cap !== undefined && total > options.cap) {
    issues.push(`Total ${total} exceeds the cap of ${options.cap} and was reduced`);
    total = options.cap;
  }
  return { total, max, perCriterion, issues };
}

// ───────────────────────────── review routing ─────────────────────────────

export interface ReviewSignals {
  ocrConfidence: number;
  matchConfidence: number;
  gradingConfidence: number;
  /** Rubric/interpretation was ambiguous or the evaluator reported conflicting readings. */
  rubricAmbiguous?: boolean;
  /** The model output passed schema validation. */
  aiOutputValid: boolean;
  scoreIssues: string[];
}

export interface ReviewPolicy {
  minOcrConfidence: number;
  minMatchConfidence: number;
  minGradingConfidence: number;
}

export const DEFAULT_REVIEW_POLICY: ReviewPolicy = {
  minOcrConfidence: 0.75,
  minMatchConfidence: 0.8,
  minGradingConfidence: 0.7,
};

export interface ReviewRouting {
  /** AUTO_ACCEPTABLE never means final: a teacher still approves it. */
  status: 'AUTO_ACCEPTABLE' | 'NEEDS_REVIEW';
  reasons: string[];
}

export function routeForReview(signals: ReviewSignals, policy: ReviewPolicy = DEFAULT_REVIEW_POLICY): ReviewRouting {
  const reasons: string[] = [];
  if (!signals.aiOutputValid) reasons.push('Evaluator output failed validation');
  if (signals.ocrConfidence < policy.minOcrConfidence) reasons.push(`Handwriting recognition confidence ${signals.ocrConfidence.toFixed(2)} is below ${policy.minOcrConfidence}`);
  if (signals.matchConfidence < policy.minMatchConfidence) reasons.push(`Answer-to-question match confidence ${signals.matchConfidence.toFixed(2)} is below ${policy.minMatchConfidence}`);
  if (signals.gradingConfidence < policy.minGradingConfidence) reasons.push(`Grading confidence ${signals.gradingConfidence.toFixed(2)} is below ${policy.minGradingConfidence}`);
  if (signals.rubricAmbiguous) reasons.push('Rubric interpretation was ambiguous');
  if (signals.scoreIssues.length > 0) reasons.push(`Marks needed correction: ${signals.scoreIssues[0]}`);
  return { status: reasons.length === 0 ? 'AUTO_ACCEPTABLE' : 'NEEDS_REVIEW', reasons };
}

// ─────────────────────────── evaluation lifecycle ───────────────────────────

export type EvaluationStatus = 'PENDING' | 'AI_SCORED' | 'NEEDS_REVIEW' | 'REVIEWED' | 'FINALIZED' | 'REJECTED' | 'FAILED';
export type Actor = 'AI' | 'HUMAN';

const TRANSITIONS: Record<EvaluationStatus, EvaluationStatus[]> = {
  PENDING: ['AI_SCORED', 'NEEDS_REVIEW', 'FAILED'],
  AI_SCORED: ['PENDING', 'NEEDS_REVIEW', 'REVIEWED', 'FINALIZED', 'REJECTED'],
  NEEDS_REVIEW: ['PENDING', 'REVIEWED', 'REJECTED'],
  REVIEWED: ['FINALIZED', 'PENDING', 'REJECTED'],
  FINALIZED: ['REVIEWED'], // only through a controlled reopen
  REJECTED: ['PENDING'],
  FAILED: ['PENDING'],
};

/** What the AI pipeline itself is allowed to write. */
const AI_WRITABLE_TARGETS: EvaluationStatus[] = ['AI_SCORED', 'NEEDS_REVIEW', 'FAILED'];

export function canTransition(
  from: EvaluationStatus,
  to: EvaluationStatus,
  actor: Actor,
  options: { reopenReason?: string } = {},
): { ok: boolean; reason?: string } {
  if (!TRANSITIONS[from].includes(to)) return { ok: false, reason: `${from} cannot move to ${to}` };
  if (actor === 'AI') {
    if (from === 'REVIEWED' || from === 'FINALIZED') return { ok: false, reason: 'The AI pipeline may not change a reviewed or finalized evaluation' };
    if (!AI_WRITABLE_TARGETS.includes(to)) return { ok: false, reason: `The AI pipeline may not set status ${to}` };
  }
  if (from === 'FINALIZED' && !options.reopenReason?.trim()) {
    return { ok: false, reason: 'Reopening a finalized evaluation requires a reason' };
  }
  return { ok: true };
}

/** Bulk approval only ever covers evaluations the routing policy considered safe. */
export function canBulkApprove(evaluation: { status: EvaluationStatus; routing: ReviewRouting['status']; hasOpenIssues: boolean }): boolean {
  return evaluation.status === 'AI_SCORED' && evaluation.routing === 'AUTO_ACCEPTABLE' && !evaluation.hasOpenIssues;
}

export function nextStatusAfterAi(routing: ReviewRouting): 'AI_SCORED' | 'NEEDS_REVIEW' {
  return routing.status === 'AUTO_ACCEPTABLE' ? 'AI_SCORED' : 'NEEDS_REVIEW';
}
