import fs from 'fs/promises';
import path from 'path';
import { AIOrchestrator } from './ai/ai-orchestrator.service';
import { logger } from '../utils/logger';

export interface AnswerRegionMap {
  questionNumber: string;
  page: number;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  confidence: number;
  additionalRegions?: Array<{
    page: number;
    topPercent: number;
    leftPercent: number;
    widthPercent: number;
    heightPercent: number;
  }>;
}

interface ExpectedQuestion {
  number: string;
  text: string;
  maxMarks?: number;
}

const normaliseQuestionNumber = (value: unknown) => String(value || '').replace(/[^0-9a-z]/gi, '').toLowerCase();
const clamp = (value: unknown, lower: number, upper: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(lower, Math.min(upper, numeric)) : lower;
};

function resolveSubmissionPath(filePath: string) {
  if (filePath.startsWith('/uploads/') || filePath.startsWith('uploads/') || filePath.startsWith('\\uploads\\') || filePath.startsWith('uploads\\')) {
    return path.resolve(process.cwd(), filePath.replace(/^[/\\]+/, ''));
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

/**
 * Produces image-anchored answer regions.  This intentionally has no visual
 * fallback: a guessed grid is worse than showing no region at all.
 */
export async function mapAnswerRegions(
  filePath: string,
  fileType: string,
  expectedQuestions: ExpectedQuestion[],
): Promise<AnswerRegionMap[]> {
  if (!fileType.startsWith('image/') || expectedQuestions.length === 0) return [];

  try {
    const buffer = await fs.readFile(resolveSubmissionPath(filePath));
    const mimeType = fileType.includes('png') ? 'image/png' : fileType.includes('webp') ? 'image/webp' : 'image/jpeg';
    const expected = expectedQuestions.map((question) => ({
      number: question.number,
      text: question.text.slice(0, 180),
      maxMarks: question.maxMarks,
    }));
    const data = await AIOrchestrator.generate({
      intent: 'EvaluateAssignment',
      context: '',
      temperature: 0,
      responseFormat: { type: 'json_object' },
      media: [{ type: 'image_url', url: `data:${mimeType};base64,${buffer.toString('base64')}` }],
      taskInstructions: [
        'You are a document-layout OCR mapper. Inspect the supplied answer-sheet image directly.',
        'Locate the handwriting belonging to each expected question. Question numbers may appear as "1)", "1.", "1" or "1 (a)".',
        'Use the written question-number anchor and the actual handwritten ink only. Do not allocate equal rows, infer space from marks, include blank paper, or include the next answer.',
        'Treat each MCQ answer as its own compact single-line region. Do not merge an MCQ section heading or neighbouring MCQ rows into one box. If the first answers are MCQs at the top of the sheet, their boxes must remain in that top section rather than being distributed down the page.',
        'A multi-line answer must be one tight rectangle around all its lines. If an answer continues in a separate non-touching area, put that in additionalRegions.',
        'Coordinates must be percentages of the full ORIGINAL image: x is leftPercent, y is topPercent, and width/height are positive. Add 1% padding around ink.',
        'Return JSON only: {"answerRegions":[{"questionNumber":"6","page":1,"topPercent":20.1,"leftPercent":7.2,"widthPercent":83.4,"heightPercent":15.7,"confidence":0.94,"additionalRegions":[]}]}',
        `Expected questions (only return these): ${JSON.stringify(expected)}`,
        'Omit a question if its answer position is uncertain. Never invent a bounding box.',
      ].join('\n'),
    });

    const rawRegions = Array.isArray(data?.answerRegions) ? data.answerRegions : [];
    const expectedNumbers = new Set(expectedQuestions.map((question) => normaliseQuestionNumber(question.number)));
    const regions = rawRegions
      .filter((region: any) => expectedNumbers.has(normaliseQuestionNumber(region?.questionNumber)))
      .map((region: any): AnswerRegionMap | null => {
        const leftPercent = clamp(region.leftPercent, 0, 99);
        const topPercent = clamp(region.topPercent, 0, 99);
        const widthPercent = clamp(region.widthPercent, 0, 100 - leftPercent);
        const heightPercent = clamp(region.heightPercent, 0, 100 - topPercent);
        const confidence = clamp(region.confidence, 0, 1);
        if (widthPercent < 2 || heightPercent < 1 || confidence < 0.6) return null;
        return {
          questionNumber: String(region.questionNumber),
          page: 1,
          topPercent,
          leftPercent,
          widthPercent,
          heightPercent,
          confidence,
          additionalRegions: Array.isArray(region.additionalRegions) ? region.additionalRegions
            .map((continuation: any) => ({
              page: 1,
              topPercent: clamp(continuation.topPercent, 0, 99),
              leftPercent: clamp(continuation.leftPercent, 0, 99),
              widthPercent: clamp(continuation.widthPercent, 0, 100),
              heightPercent: clamp(continuation.heightPercent, 0, 100),
            }))
            .filter((continuation: any) => continuation.widthPercent >= 2 && continuation.heightPercent >= 1)
            : undefined,
        };
      })
      .filter(Boolean) as AnswerRegionMap[];

    // A duplicate label from OCR is ambiguous; do not render an arbitrary one.
    const seen = new Set<string>();
    const uniqueRegions = regions.filter((region) => {
      const key = normaliseQuestionNumber(region.questionNumber);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Boxes for different answers cannot substantially overlap. Discard the
    // lower-confidence result instead of showing one answer as another.
    return uniqueRegions
      .sort((a, b) => b.confidence - a.confidence)
      .filter((candidate, _, accepted) => !accepted.some((existing) => {
        const left = Math.max(candidate.leftPercent, existing.leftPercent);
        const right = Math.min(candidate.leftPercent + candidate.widthPercent, existing.leftPercent + existing.widthPercent);
        const top = Math.max(candidate.topPercent, existing.topPercent);
        const bottom = Math.min(candidate.topPercent + candidate.heightPercent, existing.topPercent + existing.heightPercent);
        const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
        const candidateArea = candidate.widthPercent * candidate.heightPercent;
        return candidateArea > 0 && overlap / candidateArea > 0.35;
      }))
      .sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber));
  } catch (error) {
    logger.warn({ error, filePath }, 'Answer-sheet layout mapping failed; no estimated regions will be shown');
    return [];
  }
}
