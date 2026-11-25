import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AIOrchestrator } from './ai/ai-orchestrator.service';
import { logger } from '../utils/logger';
import { retrieveContext } from './rag.service';
import { invalidateCache } from '../api/common/cache';
import { getPaper } from './paper.service';
import { extractTextFromFileBuffer } from './document-extractor.service';
import { mapAnswerRegions } from './answer-region-mapper.service';
import { segmentByLabels, type SegmentationResult } from '../domain/answer-matching';
import {
  scoreAnswer,
  routeForReview,
  nextStatusAfterAi,
  type CriterionAward,
  type EvaluationStatus,
  type ReviewRouting,
  type RubricCriterion,
} from '../domain/scoring';

/** True when OCR text contains at least two recognisable question labels. */
export function looksMultiQuestion(text: string): boolean {
  return segmentByLabels(text).segments.length >= 2;
}

/** Segment multi-question OCR into labelled blocks for the evaluator prompt. */
export function segmentAnswersForGrading(text: string): {
  promptText: string;
  segmentation: SegmentationResult | null;
  matchConfidence: number;
} {
  if (!looksMultiQuestion(text)) {
    return { promptText: text, segmentation: null, matchConfidence: 1 };
  }
  const segmentation = segmentByLabels(text);
  const structured = segmentation.segments.map((s) => `Q${s.label}: ${s.text}`).join('\n\n');
  const promptText =
    structured +
    (segmentation.unlabeled ? `\n\n[Unlabeled preamble]\n${segmentation.unlabeled}` : '');
  const ambiguous = segmentation.segments.some((s) => s.ambiguous);
  return { promptText, segmentation, matchConfidence: ambiguous ? 0.65 : 0.9 };
}

export function mapAiCriteriaToAwards(raw: unknown): CriterionAward[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Record<string, unknown>;
      const criterionId = String(o.criterionId ?? o.id ?? '').trim();
      if (!criterionId) return null;
      const marksAwarded = Number(o.marksAwarded ?? o.score ?? o.marks ?? 0);
      const rationale = String(o.rationale ?? o.explanation ?? '');
      const confRaw = Number(o.confidence ?? 0.75);
      const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0.75;
      return { criterionId, marksAwarded, rationale, confidence };
    })
    .filter((a): a is CriterionAward => a !== null);
}

export function validateAiCriterionPayload(raw: unknown, criteria: RubricCriterion[]): boolean {
  if (!Array.isArray(raw)) return false;
  const awards = mapAiCriteriaToAwards(raw);
  if (awards.length === 0) return false;
  if (criteria.length === 0) return true;
  const ids = new Set(criteria.map((c) => c.id));
  return awards.some((a) => ids.has(a.criterionId));
}

export interface DomainScoringInput {
  rubricCriteria: RubricCriterion[];
  aiPayload: Record<string, unknown>;
  fallbackScore: number;
  fallbackTotalMarks: number;
  fallbackCriteriaGrades: unknown[];
  ocrConfidence: number;
  matchConfidence: number;
  rubricAmbiguous?: boolean;
}

export interface DomainScoringResult {
  score: number;
  totalMarks: number;
  criteriaGrades: Array<Record<string, unknown>>;
  evaluationStatus: EvaluationStatus;
  reviewRouting: ReviewRouting;
  scoreIssues: string[];
}

export function applyDomainScoring(input: DomainScoringInput): DomainScoringResult {
  const {
    rubricCriteria,
    aiPayload,
    fallbackScore,
    fallbackTotalMarks,
    fallbackCriteriaGrades,
    ocrConfidence,
    matchConfidence,
    rubricAmbiguous,
  } = input;

  const awardSource = aiPayload.criterionAwards ?? aiPayload.criteriaGrades;
  const awards = mapAiCriteriaToAwards(awardSource);
  const aiOutputValid =
    rubricCriteria.length > 0 ? validateAiCriterionPayload(awardSource, rubricCriteria) : true;

  if (rubricCriteria.length === 0) {
    const routing = routeForReview({
      ocrConfidence,
      matchConfidence,
      gradingConfidence: 0.75,
      aiOutputValid: true,
      scoreIssues: [],
      rubricAmbiguous,
    });
    return {
      score: fallbackScore,
      totalMarks: fallbackTotalMarks,
      criteriaGrades: (fallbackCriteriaGrades as Array<Record<string, unknown>>) ?? [],
      evaluationStatus: nextStatusAfterAi(routing),
      reviewRouting: routing,
      scoreIssues: [],
    };
  }

  const scoreResult = scoreAnswer(rubricCriteria, awards);
  const nameById = new Map(rubricCriteria.map((c) => [c.id, c.name]));
  const rationaleById = new Map(awards.map((a) => [a.criterionId, a.rationale]));
  const criteriaGrades = scoreResult.perCriterion.map((pc) => ({
    criterionId: pc.criterionId,
    criterionName: nameById.get(pc.criterionId) ?? '',
    score: pc.awarded,
    maxScore: pc.max,
    maxMarks: pc.max,
    explanation: rationaleById.get(pc.criterionId) ?? '',
    missing: pc.missing,
  }));

  const gradingConfidence =
    awards.length > 0
      ? awards.reduce((sum, a) => sum + a.confidence, 0) / awards.length
      : 0.5;

  const routing = routeForReview({
    ocrConfidence,
    matchConfidence,
    gradingConfidence,
    aiOutputValid,
    scoreIssues: scoreResult.issues,
    rubricAmbiguous,
  });

  return {
    score: scoreResult.total,
    totalMarks: scoreResult.max,
    criteriaGrades,
    evaluationStatus: nextStatusAfterAi(routing),
    reviewRouting: routing,
    scoreIssues: scoreResult.issues,
  };
}

function estimateOcrConfidence(extractedText: string): number {
  const trimmed = extractedText.trim();
  if (!trimmed) return 0.4;
  if (trimmed.length < 20) return 0.6;
  return 0.85;
}

export async function extractTextFromFile(filePath: string, fileType: string): Promise<string> {
  try {
    if (!filePath || typeof filePath !== 'string') return '';
    let resolvedPath = filePath;
    if (filePath.startsWith('/uploads/') || filePath.startsWith('uploads/') || filePath.startsWith('\\uploads\\') || filePath.startsWith('uploads\\')) {
      const rel = filePath.replace(/^[/\\]+/, '');
      resolvedPath = path.resolve(process.cwd(), rel);
    } else if (!path.isAbsolute(filePath)) {
      resolvedPath = path.resolve(process.cwd(), filePath);
    }
    const buffer = await fs.readFile(resolvedPath);
    const filename = path.basename(resolvedPath);
    return await extractTextFromFileBuffer(buffer, filename, fileType);
  } catch (error) {
    logger.error({ error, filePath, fileType }, 'Failed to extract text from file');
    return '';
  }
}

export async function evaluateSubmission(submissionId: string): Promise<any> {
  const submission = await prisma.studentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  // Get Assignment config or auto-create default if missing
  let config = await prisma.assignmentGradingConfig.findUnique({
    where: { assignmentId: submission.assignmentId },
    include: { rubric: { include: { criteria: true } } },
  });

  if (!config) {
    config = await prisma.assignmentGradingConfig.upsert({
      where: { assignmentId: submission.assignmentId },
      create: {
        assignmentId: submission.assignmentId,
        answerKeyText: '',
        autoEvaluate: true,
      },
      update: {},
      include: { rubric: { include: { criteria: true } } },
    });
  }

  const studentAnswerText = await extractTextFromFile(submission.fileUrl, submission.fileType);
  const { promptText: studentAnswerForPrompt, segmentation, matchConfidence } =
    segmentAnswersForGrading(studentAnswerText);
  const ocrConfidence = estimateOcrConfidence(studentAnswerText);
  const generatedPaper = await getPaper(submission.assignmentId).catch(() => null);
  const generatedPaperSections = generatedPaper && Array.isArray(generatedPaper.sections) ? generatedPaper.sections as any[] : [];
  const generatedPaperText = generatedPaperSections
    .map((section: any) => `${section.title}\n${(Array.isArray(section.questions) ? section.questions : []).map((question: any) => `${question.question} (${question.marks} marks)`).join('\n')}`)
    .join('\n\n');

  const rubricPrompt = config.rubric
    ? `Use the following AI-Structured Rubric Criteria to evaluate the student's submission.
       EVALUATE EVERY CRITERION INDEPENDENTLY.
       For each criterion:
       - Check for Semantic matches (synonyms, equivalent logic, conceptual understanding). DO NOT use strict keyword matching.
       - Use intelligent partial marking if the core concept or logic exists.
       - Provide an explicit "explanation" detailing exactly why marks were awarded, why they were deducted, what concepts were missing, and the evidence found in the answer.

       Rubric Criteria:
` +
      config.rubric.criteria.map((c: any) => 
        `- ${c.name} (ID: ${c.id}) 
         Max Marks: ${c.maxMarks}
         Description: ${c.description}
         Expected Concepts: ${c.expectedConcepts ? JSON.stringify(c.expectedConcepts) : 'N/A'}
         Teacher Notes: ${c.teacherNotes ? c.teacherNotes : 'N/A'}`
      ).join('\n\n')
    : 'No rubric provided. Evaluate overall correctness.';

  let ragContext = '';
  if (submission.assignment.organizationId) {
    try {
      ragContext = await retrieveContext(studentAnswerText.substring(0, 1000), submission.assignment.organizationId, 3);
    } catch (e) {
      logger.warn(`Failed to retrieve RAG context: ${e}`);
    }
  }

  const prompt = [
    'Question Paper:',
    config.questionPaperText || generatedPaperText || 'No question paper was uploaded. Use the answer key and rubric.',
    '',
    'Answer Key:',
    config.answerKeyText,
    '',
    'Rubric with Semantic Expectations & Policies:',
    rubricPrompt,
    '',
    'Student Submission:',
    studentAnswerForPrompt,
    '',
    'Task: Evaluate the submission. You MUST return a structured JSON object containing:',
    '- score: total awarded marks (informational; server will recompute from criterionAwards when a rubric exists).',
    '- totalMarks: maximum marks used for evaluation.',
    '- generalFeedback: short overall feedback.',
    '- questions: one item per question in the question paper. Each item must include questionNumber, score, maxMarks, studentAnswer, correctAnswer, and a detailed reason explaining why the answer is correct, partial, incorrect, or left blank.',
    '- criterionAwards: when a rubric is provided, one item per rubric criterion with criterionId, marksAwarded, rationale (why marks were awarded or deducted), and confidence (0 to 1).',
    '- criteriaGrades: optional legacy alias for criterionAwards with criterionId, score, explanation, and confidence.'
  ].join('\n');

  logger.info({ submissionId }, 'AI Assignment Evaluation started');

  try {
    const data = await AIOrchestrator.generate({
      intent: 'EvaluateAssignment',
      context: ragContext,
      taskInstructions: prompt,
      responseFormat: { type: 'json_object' }
    });

    const correctTotalMarks = config.rubric 
      ? config.rubric.criteria.reduce((sum, c) => sum + c.maxMarks, 0)
      : submission.assignment.totalMarks;

    const computedScore = Number(data.score ?? data.totalScore ?? data.marks) || 0;
    const computedQuestionGrades = Array.isArray(data.questions) && data.questions.length > 0
      ? data.questions
      : Array.isArray(data.questionGrades) && data.questionGrades.length > 0
      ? data.questionGrades
      : [];
    const rawCriteriaGrades = Array.isArray(data.criterionAwards) && data.criterionAwards.length > 0
      ? data.criterionAwards
      : Array.isArray(data.criteriaGrades) && data.criteriaGrades.length > 0
      ? data.criteriaGrades
      : [];

    const rubricCriteria: RubricCriterion[] = config.rubric
      ? config.rubric.criteria.map((c: { id: string; name: string; maxMarks: number }) => ({
          id: c.id,
          name: c.name,
          maxMarks: c.maxMarks,
        }))
      : [];

    const domainScoring = applyDomainScoring({
      rubricCriteria,
      aiPayload: data as Record<string, unknown>,
      fallbackScore: computedScore,
      fallbackTotalMarks: correctTotalMarks,
      fallbackCriteriaGrades: rawCriteriaGrades.length > 0 ? rawCriteriaGrades : computedQuestionGrades,
      ocrConfidence,
      matchConfidence,
      rubricAmbiguous: segmentation?.segments.some((s) => s.ambiguous),
    });

    const finalScore = domainScoring.score;
    const finalTotalMarks = domainScoring.totalMarks;
    const computedCriteria = domainScoring.criteriaGrades;

    const expectedQuestions = generatedPaperSections
      .flatMap((section: any) => Array.isArray(section.questions) ? section.questions : [])
      .map((question: any, index: number) => {
        const marks = Number(question.marks) || undefined;
        const qText = String(question.question || '');
        const isMcq =
          question.type === 'mcq' ||
          (Array.isArray(question.options) && question.options.length > 0) ||
          (marks !== undefined && marks <= 1 && /^[a-e]$/i.test(String(question.answer || '').trim())) ||
          /\b(multiple choice|mcq|choose the correct|select one)\b/i.test(qText);

        return {
          number: String(question.number || index + 1),
          text: qText,
          maxMarks: marks,
          isMcq,
          questionType: (isMcq ? 'mcq' : marks && marks > 3 ? 'long' : 'short') as 'mcq' | 'short' | 'long',
        };
      });

    // Fallback: parse questions from questionPaperText if generatedPaper has no sections
    if (expectedQuestions.length === 0 && config.questionPaperText) {
      const lines = config.questionPaperText.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const qRegex = /^(?:Q(?:uestion)?\s*)?(\d+(?:\s*\([a-z0-9]+\)|\s*[a-z]\b)?)[.:\-)]\s*(.+)/i;
      let inMcqSection = false;

      lines.forEach((line: string) => {
        if (/multiple\s*choice|mcq/i.test(line)) {
          inMcqSection = true;
        } else if (/short\s*answer|long\s*answer|descriptive|section\s*[b-z]/i.test(line)) {
          inMcqSection = false;
        }

        const match = line.match(qRegex);
        if (match) {
          const number = match[1].trim();
          let text = match[2].trim();
          let marks: number | undefined;
          const marksMatch = text.match(/\[(\d+)\s*(?:marks?|pts?|m)?\]|\((\d+)\s*(?:marks?|pts?|m)?\)/i);
          if (marksMatch) {
            marks = Number(marksMatch[1] || marksMatch[2]);
            text = text.replace(marksMatch[0], '').trim();
          }

          const isMcq = inMcqSection || (marks !== undefined && marks <= 1) || /\b(choose|select|multiple choice|mcq)\b/i.test(text);

          expectedQuestions.push({
            number,
            text,
            maxMarks: marks,
            isMcq,
            questionType: (isMcq ? 'mcq' : marks && marks > 3 ? 'long' : 'short') as 'mcq' | 'short' | 'long',
          });
        }
      });
    }

    const mappingResult = await mapAnswerRegions(submission.fileUrl, submission.fileType, expectedQuestions);
    const answerRegions = mappingResult.regions;
    const submissionPages = mappingResult.pages;

    const answerRegionsPayload = {
      regions: answerRegions,
      pages: submissionPages,
      questions: computedQuestionGrades,
      evaluationStatus: domainScoring.evaluationStatus,
      reviewRouting: domainScoring.reviewRouting,
      scoreIssues: domainScoring.scoreIssues,
      answerSegments: segmentation
        ? segmentation.segments.map((s) => ({
            label: s.label,
            ambiguous: s.ambiguous,
            parts: s.parts,
          }))
        : undefined,
    };

    // Save evaluation to database with regions, pages, and question evaluations
    const evaluation = await prisma.submissionEvaluation.upsert({
      where: { submissionId },
      create: {
        submissionId,
        score: finalScore,
        totalMarks: finalTotalMarks,
        generalFeedback: data.generalFeedback || data.feedback || '',
        criteriaGrades: computedCriteria as unknown as Prisma.InputJsonValue,
        answerRegions: answerRegionsPayload as unknown as Prisma.InputJsonValue,
      },
      update: {
        score: finalScore,
        totalMarks: finalTotalMarks,
        generalFeedback: data.generalFeedback || data.feedback || '',
        criteriaGrades: computedCriteria as unknown as Prisma.InputJsonValue,
        answerRegions: answerRegionsPayload as unknown as Prisma.InputJsonValue,
      },
    });

    const submissionStatus =
      domainScoring.evaluationStatus === 'NEEDS_REVIEW' ? 'UNDER_REVIEW' : 'GRADED';

    await prisma.studentSubmission.update({
      where: { id: submissionId },
      data: { status: submissionStatus },
    });

    // Invalidate cached student-performance analytics so fresh scores are reflected
    await invalidateCache(`analytics:student:${submission.studentId}`).catch(() => {});

    logger.info({ submissionId, score: evaluation.score }, 'AI Assignment Evaluation completed');
    return {
      ...evaluation,
      questions: computedQuestionGrades,
      answerRegions,
      pages: submissionPages,
      evaluationStatus: domainScoring.evaluationStatus,
      reviewRouting: domainScoring.reviewRouting,
    };
  } catch (error) {
    logger.error(error, `AI Assignment Evaluation failed for submissionId: ${submissionId}`);
    throw error;
  }
}

export interface OverridePayload {
  overrideScore: number;
  reason?: string;
  teacherFeedback?: string;
  criteriaGrades?: any[];
  teacherId?: string;
}

export async function overrideEvaluation(submissionId: string, payload: OverridePayload) {
  const evaluation = await prisma.submissionEvaluation.findUnique({
    where: { submissionId },
  });

  if (!evaluation) {
    throw new Error('Evaluation not found for this submission');
  }

  const previousScore = evaluation.score;
  const newScore = Number(payload.overrideScore);

  const updated = await prisma.submissionEvaluation.update({
    where: { submissionId },
    data: {
      score: newScore,
      isOverridden: true,
      overrideReason: payload.reason || 'Manual teacher grade override',
      teacherFeedback: payload.teacherFeedback || payload.reason || '',
      overriddenBy: payload.teacherId || 'teacher',
      overriddenAt: new Date(),
      criteriaGrades: (payload.criteriaGrades ?? evaluation.criteriaGrades ?? []) as Prisma.InputJsonValue,
      teacherOverride: {
        originalScore: previousScore,
        overrideScore: newScore,
        reason: payload.reason,
        teacherFeedback: payload.teacherFeedback,
        updatedAt: new Date().toISOString(),
        updatedBy: payload.teacherId,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.studentSubmission.update({
    where: { id: submissionId },
    data: { status: 'GRADED' },
  });

  const sub = await prisma.studentSubmission.findUnique({ where: { id: submissionId }, select: { studentId: true } });
  if (sub?.studentId) {
    await invalidateCache(`analytics:student:${sub.studentId}`).catch(() => {});
  }

  return { evaluation: updated, previousScore, newScore };
}
