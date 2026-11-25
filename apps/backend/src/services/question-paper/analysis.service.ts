import fs from 'fs';
import { randomUUID } from 'crypto';
import prisma from '../../config/prisma';
import { runDocumentPipeline, classifyDocument } from '../document-intel/pipeline';
import { getR2Storage } from '../storage/r2-storage';
import { segmentByLabels } from '../../domain/answer-matching';
import { AIOrchestrator } from '../ai/ai-orchestrator.service';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import {
  aiPaperQuestionsSchema,
  type AiPaperQuestionsPayload,
  type AnalysisReport,
} from '../../api/question-paper/analysis-validators';

export type ReviewStatus = 'OK' | 'NEEDS_REVIEW' | 'SUGGESTION_ONLY';
export type MarksSource = 'detected' | 'inferred' | 'teacher' | 'unknown';

export interface AnalyzedQuestion {
  id: string;
  number: string;
  subquestion?: string;
  text: string;
  marks?: number;
  marksSource: MarksSource;
  reviewStatus: ReviewStatus;
  confidence: number;
  suggestions?: AnalysisReport['questions'][0]['suggestions'];
  teacherCorrections?: Record<string, unknown>;
}

const SUGGESTION_CONFIDENCE_FLOOR = 0.7;
const MARKS_PATTERNS: RegExp[] = [
  /\[\s*(\d{1,3})\s*(?:marks?|m)\s*\]/i,
  /\(\s*(\d{1,3})\s*(?:marks?|m)\s*\)/i,
  /(?:^|\s)(\d{1,3})\s*marks?\s*$/i,
];

export interface AnalysisJobMetadata {
  filename: string;
  mimeType: string;
  storageKey: string;
  preferHandwriting?: boolean;
  report?: AnalysisReport;
  pipelineDocumentId?: string;
  aiEnrichmentApplied?: boolean;
  aiEnrichmentRejected?: boolean;
}

export interface StartAnalysisInput {
  organizationId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  storageKey: string;
  preferHandwriting?: boolean;
  useAiEnrichment?: boolean;
  idempotencyKey?: string;
}

function labelParts(label: string): { number: string; subquestion?: string } {
  const bits = label.split('.').filter(Boolean);
  if (bits.length === 0) return { number: label };
  return { number: bits[0], subquestion: bits.length > 1 ? bits.slice(1).join('.') : undefined };
}

export function parseMarksFromText(text: string): {
  marks?: number;
  confidence: number;
  cleaned: string;
} {
  for (const re of MARKS_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const marks = Number.parseInt(m[1], 10);
    if (Number.isFinite(marks) && marks > 0 && marks <= 500) {
      return {
        marks,
        confidence: 0.85,
        cleaned: text.replace(re, '').trim(),
      };
    }
  }
  return { marks: undefined, confidence: 0, cleaned: text.trim() };
}

/** Regex fallback when line-based label segmentation yields too few blocks. */
function splitQuestionBlocks(text: string): string[] {
  const blocks = text
    .split(/(?=^\s*(?:(?:question|q)\s*)?\d{1,3}\s*[.)])/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 5);
  return blocks.length > 0 ? blocks : [text.trim()].filter(Boolean);
}

function parseBlockHeader(block: string): { number: string; subquestion?: string; body: string } | null {
  const firstLine = block.split(/\r?\n/)[0] ?? block;
  const m =
    firstLine.match(
      /^\s*(?:(?:question|q)\s*)?(\d{1,3})\s*([.)])\s*((?:\(\s*[a-z]{1,4}\s*\)\s*)?)/i,
    ) ?? firstLine.match(/^\s*\(\s*([a-z]{1,4})\s*\)\s*/i);
  if (!m) return null;

  if (m[1] && /^\d/.test(m[1])) {
    const number = m[1];
    const subParts = [...(m[3] ?? '').matchAll(/\(\s*([a-z]{1,4})\s*\)/gi)].map((x) => x[1].toLowerCase());
    const subquestion = subParts.length ? subParts.join('.') : undefined;
    const body = block.slice(firstLine.length).trim() || block;
    return { number, subquestion, body };
  }

  const sub = (m[1] ?? m[2] ?? '').toLowerCase();
  return { number: '0', subquestion: sub, body: block };
}

function heuristicConfidence(ocrConfidence: number, marksFound: boolean, textLen: number): number {
  let c = Math.min(1, Math.max(0, ocrConfidence));
  if (!marksFound) c *= 0.75;
  if (textLen < 15) c *= 0.6;
  return Math.round(c * 1000) / 1000;
}

export function extractQuestionsFromText(fullText: string, ocrConfidence = 0.7): AnalyzedQuestion[] {
  const trimmed = fullText.trim();
  if (!trimmed) return [];

  const { segments, unlabeled } = segmentByLabels(trimmed);
  const results: AnalyzedQuestion[] = [];

  const consumeSegment = (label: string, rawText: string) => {
    const { number, subquestion } = labelParts(label);
    const { marks, confidence: marksConf, cleaned } = parseMarksFromText(rawText);
    const text = cleaned || rawText.trim();
    if (text.length < 3) return;

    const marksFound = marks !== undefined;
    const confidence = heuristicConfidence(ocrConfidence, marksFound, text.length);
    results.push({
      id: randomUUID(),
      number,
      subquestion,
      text,
      marks,
      marksSource: marksFound ? 'detected' : 'unknown',
      reviewStatus: confidence < SUGGESTION_CONFIDENCE_FLOOR || !marksFound ? 'NEEDS_REVIEW' : 'OK',
      confidence: marksFound ? Math.max(confidence, marksConf) : confidence,
    });
  };

  if (segments.length >= 1) {
    for (const s of segments) {
      consumeSegment(s.label, s.text);
    }
    if (unlabeled.trim().length > 40) {
      for (const block of splitQuestionBlocks(unlabeled)) {
        const header = parseBlockHeader(block);
        if (header) {
          const { marks, cleaned } = parseMarksFromText(header.body);
          const text = cleaned || header.body;
          if (text.length >= 3) {
            results.push({
              id: randomUUID(),
              number: header.number,
              subquestion: header.subquestion,
              text,
              marks,
              marksSource: marks !== undefined ? 'detected' : 'unknown',
              reviewStatus: 'NEEDS_REVIEW',
              confidence: heuristicConfidence(ocrConfidence, marks !== undefined, text.length),
            });
          }
        }
      }
    }
  } else {
    for (const block of splitQuestionBlocks(trimmed)) {
      const header = parseBlockHeader(block);
      if (!header) continue;
      const { marks, cleaned } = parseMarksFromText(header.body);
      const text = cleaned || header.body;
      if (text.length < 3) continue;
      results.push({
        id: randomUUID(),
        number: header.number,
        subquestion: header.subquestion,
        text,
        marks,
        marksSource: marks !== undefined ? 'detected' : 'unknown',
        reviewStatus: marks !== undefined ? 'NEEDS_REVIEW' : 'NEEDS_REVIEW',
        confidence: heuristicConfidence(ocrConfidence, marks !== undefined, text.length),
      });
    }
  }

  return results;
}

function suggestionField(
  value: string | undefined,
  confidence: number,
): { value: string; confidence: number } | undefined {
  if (!value?.trim()) return undefined;
  return { value: value.trim(), confidence };
}

export function mergeAiSuggestions(
  heuristic: AnalyzedQuestion[],
  ai: AiPaperQuestionsPayload,
  ocrConfidence: number,
): { questions: AnalyzedQuestion[]; rejected: boolean } {
  const byKey = new Map<string, AnalyzedQuestion>();
  for (const q of heuristic) {
    const key = `${q.number}:${q.subquestion ?? ''}`;
    byKey.set(key, q);
  }

  for (const item of ai.questions) {
    const key = `${item.number}:${item.subquestion ?? ''}`;
    const existing = byKey.get(key);
    const base: AnalyzedQuestion =
      existing ??
      ({
        id: randomUUID(),
        number: item.number,
        subquestion: item.subquestion,
        text: item.text,
        marks: item.marks,
        marksSource: item.marks !== undefined ? 'inferred' : 'unknown',
        reviewStatus: 'NEEDS_REVIEW' as ReviewStatus,
        confidence: item.confidence ?? 0.5,
      } satisfies AnalyzedQuestion);

    const itemConf = item.confidence ?? 0.55;
    const suggestions: NonNullable<AnalyzedQuestion['suggestions']> = { ...(base.suggestions ?? {}) };

    const unit = suggestionField(item.unit, itemConf);
    const topic = suggestionField(item.topic, itemConf);
    const bloom = suggestionField(item.bloomLevel, itemConf);
    const diff = suggestionField(item.difficulty, itemConf);

    if (unit) suggestions.unit = unit;
    if (topic) suggestions.topic = topic;
    if (bloom) suggestions.bloomLevel = bloom;
    if (diff) suggestions.difficulty = diff;

    if (item.suggestedCoCode?.trim()) {
      suggestions.courseOutcome = {
        code: item.suggestedCoCode.trim(),
        confidence: itemConf,
        confirmed: false,
      };
    }

    let reviewStatus: ReviewStatus = base.reviewStatus;
    const lowSuggestion =
      itemConf < SUGGESTION_CONFIDENCE_FLOOR ||
      Boolean(suggestions.courseOutcome && suggestions.courseOutcome.confidence < SUGGESTION_CONFIDENCE_FLOOR);

    if (lowSuggestion || suggestions.courseOutcome) {
      reviewStatus = suggestions.courseOutcome ? 'SUGGESTION_ONLY' : 'NEEDS_REVIEW';
    }

    if (!existing && item.text.length > base.text.length) {
      base.text = item.text;
    }
    if (item.marks !== undefined && base.marks === undefined) {
      base.marks = item.marks;
      base.marksSource = 'inferred';
    }

    base.suggestions = Object.keys(suggestions).length ? suggestions : undefined;
    base.reviewStatus = reviewStatus;
    base.confidence = Math.max(base.confidence, Math.min(itemConf, ocrConfidence + 0.1));

    byKey.set(key, base);
  }

  return { questions: [...byKey.values()], rejected: false };
}

export function buildAnalysisReport(
  questions: AnalyzedQuestion[],
  pipelineReview: { reviewRequired: boolean; reviewReasons: string[] },
  pipelineMeta: { kind: string; ocrConfidence?: number; pageCount: number },
): AnalysisReport {
  const marksKnown = questions.reduce((s, q) => s + (q.marks ?? 0), 0);
  const marksUnknown = questions.filter((q) => q.marks === undefined).length;
  const marksDistribution: Record<string, number> = {};
  for (const q of questions) {
    const bucket = q.marks !== undefined ? String(q.marks) : 'unknown';
    marksDistribution[bucket] = (marksDistribution[bucket] ?? 0) + 1;
  }

  const reviewReasons = [...pipelineReview.reviewReasons];
  if (questions.some((q) => q.reviewStatus !== 'OK')) {
    reviewReasons.push('One or more questions need teacher review');
  }
  if (marksUnknown > 0) {
    reviewReasons.push(`${marksUnknown} question(s) missing mark allocation`);
  }

  const reviewRequired =
    pipelineReview.reviewRequired || questions.some((q) => q.reviewStatus !== 'OK');

  return {
    totals: {
      questionCount: questions.length,
      marksTotal: marksKnown,
      marksKnown,
      marksUnknown,
    },
    marksDistribution,
    questions,
    reviewRequired,
    reviewReasons,
    pipeline: pipelineMeta,
  };
}

async function tryAiEnrichment(
  ocrText: string,
  _preferHandwriting: boolean,
): Promise<{ payload: AiPaperQuestionsPayload | null; rejected: boolean }> {
  if (!ocrText.trim() || env.NODE_ENV === 'test') {
    return { payload: null, rejected: false };
  }

  const instructions = `Extract examination questions from OCR text. Return JSON: { "questions": [ { "number", "subquestion?", "text", "marks?", "confidence?", "unit?", "topic?", "suggestedCoCode?", "bloomLevel?", "difficulty?" } ] }.
Rules: suggestedCoCode is a tentative mapping only — never state it as confirmed. confidence is 0-1 per question.`;

  try {
    const raw = await AIOrchestrator.generate({
      intent: 'OCRPostProcessing',
      context: ocrText.slice(0, 120_000),
      taskInstructions: instructions,
      responseFormat: { type: 'json_object' },
      temperature: 0.1,
    });

    const candidate = raw?.questions !== undefined ? raw : raw?.data?.questions !== undefined ? raw.data : raw;
    const parsed = aiPaperQuestionsSchema.safeParse(candidate);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.flatten() }, '[question-paper-analysis] AI output rejected by Zod');
      return { payload: null, rejected: true };
    }
    return { payload: parsed.data, rejected: false };
  } catch (err) {
    logger.warn({ err }, '[question-paper-analysis] AI enrichment skipped');
    return { payload: null, rejected: false };
  }
}

function aggregateOcrText(pages: { text?: string }[]): string {
  return pages.map((p) => p.text ?? '').filter(Boolean).join('\n\n');
}

function meanOcrConfidence(pages: { ocrConfidence?: number }[]): number | undefined {
  const vals = pages.map((p) => p.ocrConfidence).filter((c): c is number => typeof c === 'number');
  if (!vals.length) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export async function startQuestionPaperAnalysis(input: StartAnalysisInput): Promise<{
  jobId: string;
  status: string;
  report: AnalysisReport;
}> {
  const jobId = randomUUID();
  const preferHw =
    input.preferHandwriting ??
    classifyDocument({
      mimeType: input.mimeType,
      filename: input.filename,
      preferHandwriting: input.preferHandwriting,
    }).includes('HANDWRITTEN');

  if (input.idempotencyKey) {
    const existing = await prisma.documentProcessingJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing && existing.organizationId === input.organizationId) {
      const meta = (existing.metadata ?? {}) as unknown as AnalysisJobMetadata;
      if (meta.report) {
        return { jobId: existing.id, status: existing.status, report: meta.report };
      }
    }
  }

  await prisma.documentProcessingJob.create({
    data: {
      id: jobId,
      organizationId: input.organizationId,
      sourceType: 'QUESTION_PAPER_ANALYSIS',
      storageKey: input.storageKey,
      status: 'PROCESSING',
      stage: 'PIPELINE',
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: {
        filename: input.filename,
        mimeType: input.mimeType,
        storageKey: input.storageKey,
        preferHandwriting: preferHw,
      } satisfies AnalysisJobMetadata,
    },
  });

  const pipelineDoc = await runDocumentPipeline({
    id: jobId,
    organizationId: input.organizationId,
    originalFilename: input.filename,
    mimeType: input.mimeType,
    storageKey: input.storageKey,
    buffer: input.buffer,
    preferHandwriting: preferHw,
  });

  const ocrText = aggregateOcrText(pipelineDoc.pages);
  const ocrConfidence = meanOcrConfidence(pipelineDoc.pages) ?? 0.5;
  let questions = extractQuestionsFromText(ocrText, ocrConfidence);

  let aiEnrichmentApplied = false;
  let aiEnrichmentRejected = false;

  if (input.useAiEnrichment !== false) {
    const ai = await tryAiEnrichment(ocrText, preferHw);
    aiEnrichmentRejected = ai.rejected;
    if (ai.payload) {
      const merged = mergeAiSuggestions(questions, ai.payload, ocrConfidence);
      questions = merged.questions;
      aiEnrichmentApplied = true;
    }
  }

  const report = buildAnalysisReport(
    questions,
    { reviewRequired: pipelineDoc.reviewRequired, reviewReasons: pipelineDoc.reviewReasons },
    {
      kind: pipelineDoc.kind,
      ocrConfidence,
      pageCount: pipelineDoc.pages.length,
    },
  );

  const status = report.reviewRequired ? 'NEEDS_REVIEW' : 'COMPLETED';

  const metadata: AnalysisJobMetadata = {
    filename: input.filename,
    mimeType: input.mimeType,
    storageKey: input.storageKey,
    preferHandwriting: preferHw,
    report,
    pipelineDocumentId: pipelineDoc.id,
    aiEnrichmentApplied,
    aiEnrichmentRejected,
  };

  await prisma.documentProcessingJob.update({
    where: { id: jobId },
    data: {
      status,
      stage: 'FINALIZE',
      confidence: ocrConfidence,
      metadata: metadata as object,
    },
  });

  return { jobId, status, report };
}

export async function getQuestionPaperAnalysisJob(
  organizationId: string,
  jobId: string,
): Promise<{ jobId: string; status: string; report?: AnalysisReport; error?: string }> {
  const row = await prisma.documentProcessingJob.findFirst({
    where: { id: jobId, organizationId, sourceType: 'QUESTION_PAPER_ANALYSIS' },
  });
  if (!row) {
    return { jobId, status: 'NOT_FOUND' };
  }
  const meta = (row.metadata ?? {}) as unknown as AnalysisJobMetadata;
  return {
    jobId: row.id,
    status: row.status,
    report: meta.report,
    error: row.error ?? undefined,
  };
}

export async function patchAnalysisQuestionCorrections(
  organizationId: string,
  jobId: string,
  patches: Array<{
    id?: string;
    number?: string;
    subquestion?: string;
    text?: string;
    marks?: number;
    courseOutcomeId?: string;
    courseOutcomeCode?: string;
    bloomLevel?: string;
    difficulty?: string;
    unit?: string;
    topic?: string;
  }>,
): Promise<AnalysisReport> {
  const row = await prisma.documentProcessingJob.findFirst({
    where: { id: jobId, organizationId, sourceType: 'QUESTION_PAPER_ANALYSIS' },
  });
  if (!row) throw new Error('Analysis job not found');

  const meta = (row.metadata ?? {}) as unknown as AnalysisJobMetadata;
  if (!meta.report) throw new Error('Analysis report not ready');

  const questions = [...meta.report.questions];

  for (const patch of patches) {
    const idx = questions.findIndex(
      (q) =>
        (patch.id && q.id === patch.id) ||
        (patch.number && q.number === patch.number && (patch.subquestion ?? '') === (q.subquestion ?? '')),
    );
    if (idx === -1) continue;

    const current = { ...questions[idx] };
    const corrections: Record<string, unknown> = { ...(current.teacherCorrections ?? {}) };

    if (patch.text !== undefined) {
      current.text = patch.text;
      corrections.text = patch.text;
    }
    if (patch.marks !== undefined) {
      current.marks = patch.marks;
      current.marksSource = 'teacher';
      corrections.marks = patch.marks;
    }
    if (patch.bloomLevel !== undefined) corrections.bloomLevel = patch.bloomLevel;
    if (patch.difficulty !== undefined) corrections.difficulty = patch.difficulty;
    if (patch.unit !== undefined) corrections.unit = patch.unit;
    if (patch.topic !== undefined) corrections.topic = patch.topic;
    if (patch.courseOutcomeId !== undefined) corrections.courseOutcomeId = patch.courseOutcomeId;
    if (patch.courseOutcomeCode !== undefined) corrections.courseOutcomeCode = patch.courseOutcomeCode;

    if (Object.keys(corrections).length) {
      current.teacherCorrections = corrections;
    }
    current.reviewStatus = 'OK';
    current.confidence = Math.max(current.confidence, 0.95);

    questions[idx] = current;
  }

  const report = buildAnalysisReport(
    questions,
    {
      reviewRequired: meta.report.reviewRequired,
      reviewReasons: meta.report.reviewReasons.filter((r) => !r.startsWith('One or more')),
    },
    meta.report.pipeline ?? { kind: 'UNKNOWN', pageCount: 0 },
  );

  const updatedMeta: AnalysisJobMetadata = { ...meta, report };

  await prisma.documentProcessingJob.update({
    where: { id: jobId },
    data: {
      metadata: updatedMeta as object,
      status: report.reviewRequired ? 'NEEDS_REVIEW' : 'COMPLETED',
    },
  });

  return report;
}

export async function resolveAnalysisBuffer(input: {
  file?: Express.Multer.File;
  storageKey?: string;
  organizationId: string;
}): Promise<{ buffer: Buffer; storageKey: string; filename: string; mimeType: string }> {
  if (input.file) {
    const file = input.file;
    let buffer: Buffer;
    if (file.path && fs.existsSync(file.path)) {
      buffer = fs.readFileSync(file.path);
    } else if (file.buffer) {
      buffer = file.buffer;
    } else {
      throw new Error('Could not read uploaded file');
    }
    const storageKey = `question-paper-analysis/${input.organizationId}/${file.filename}`;
    return {
      buffer,
      storageKey,
      filename: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
    };
  }

  if (!input.storageKey) {
    throw new Error('Either file upload or storageKey is required');
  }

  const stored = await prisma.storedFile.findFirst({
    where: { key: input.storageKey, organizationId: input.organizationId },
  });

  const r2 = getR2Storage();
  const buffer = await r2.get(input.storageKey);
  if (!buffer?.length) throw new Error('Stored file not found or empty');

  return {
    buffer,
    storageKey: input.storageKey,
    filename: stored?.originalName ?? input.storageKey.split('/').pop() ?? 'document',
    mimeType: stored?.mimeType ?? 'application/octet-stream',
  };
}