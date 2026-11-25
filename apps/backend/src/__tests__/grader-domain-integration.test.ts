import { describe, it, expect } from 'vitest';
import {
  looksMultiQuestion,
  segmentAnswersForGrading,
  mapAiCriteriaToAwards,
  applyDomainScoring,
} from '../services/grader.service';

describe('grader domain integration (pure path)', () => {
  it('segments multi-question OCR into labelled prompt blocks', () => {
    const text = 'Q1. First answer\n\n2. Second answer\n\n3 (a). Part a';
    expect(looksMultiQuestion(text)).toBe(true);
    const { promptText, matchConfidence, segmentation } = segmentAnswersForGrading(text);
    expect(promptText).toContain('Q1:');
    expect(promptText).toContain('Q2:');
    expect(segmentation?.segments.length).toBeGreaterThanOrEqual(2);
    expect(matchConfidence).toBe(0.9);
  });

  it('does not segment single-block answers', () => {
    const text = 'This is one continuous essay with no question labels.';
    expect(looksMultiQuestion(text)).toBe(false);
    const { promptText, segmentation } = segmentAnswersForGrading(text);
    expect(promptText).toBe(text);
    expect(segmentation).toBeNull();
  });

  it('maps legacy and structured criterion payloads', () => {
    const awards = mapAiCriteriaToAwards([
      { criterionId: 'c1', marksAwarded: 2.3, rationale: 'good', confidence: 0.9 },
      { criterionId: 'c2', score: 1, explanation: 'partial', confidence: 0.8 },
    ]);
    expect(awards).toHaveLength(2);
    expect(awards[0].marksAwarded).toBe(2.3);
    expect(awards[1].marksAwarded).toBe(1);
  });

  it('clamp scores via scoreAnswer and flags review when awards exceed max', () => {
    const rubric = [
      { id: 'c1', name: 'Concept', maxMarks: 5 },
      { id: 'c2', name: 'Working', maxMarks: 5 },
    ];
    const result = applyDomainScoring({
      rubricCriteria: rubric,
      aiPayload: {
        criterionAwards: [
          { criterionId: 'c1', marksAwarded: 7, rationale: 'over', confidence: 0.95 },
          { criterionId: 'c2', marksAwarded: 4, rationale: 'ok', confidence: 0.9 },
        ],
      },
      fallbackScore: 11,
      fallbackTotalMarks: 10,
      fallbackCriteriaGrades: [],
      ocrConfidence: 0.9,
      matchConfidence: 0.9,
    });

    expect(result.score).toBe(9);
    expect(result.totalMarks).toBe(10);
    expect(result.scoreIssues.some((i) => i.includes('exceeds'))).toBe(true);
    expect(result.evaluationStatus).toBe('NEEDS_REVIEW');
    expect(result.reviewRouting.status).toBe('NEEDS_REVIEW');
  });

  it('routes to AI_SCORED when signals are strong and output is valid', () => {
    const rubric = [{ id: 'c1', name: 'Accuracy', maxMarks: 10 }];
    const result = applyDomainScoring({
      rubricCriteria: rubric,
      aiPayload: {
        criterionAwards: [{ criterionId: 'c1', marksAwarded: 8, rationale: 'solid', confidence: 0.9 }],
      },
      fallbackScore: 8,
      fallbackTotalMarks: 10,
      fallbackCriteriaGrades: [],
      ocrConfidence: 0.9,
      matchConfidence: 0.95,
    });

    expect(result.score).toBe(8);
    expect(result.evaluationStatus).toBe('AI_SCORED');
    expect(result.reviewRouting.status).toBe('AUTO_ACCEPTABLE');
  });

  it('lowers match confidence and needs review on ambiguous duplicate labels', () => {
    const text = '1. first answer\n\n2. second answer\n\n1. duplicate label block';
    const { matchConfidence } = segmentAnswersForGrading(text);
    expect(matchConfidence).toBe(0.65);

    const result = applyDomainScoring({
      rubricCriteria: [],
      aiPayload: { score: 5 },
      fallbackScore: 5,
      fallbackTotalMarks: 10,
      fallbackCriteriaGrades: [],
      ocrConfidence: 0.5,
      matchConfidence,
      rubricAmbiguous: true,
    });

    expect(result.evaluationStatus).toBe('NEEDS_REVIEW');
  });
});