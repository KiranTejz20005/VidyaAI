import fs from 'fs/promises';
import path from 'path';
import { AIOrchestrator } from './ai/ai-orchestrator.service';
import { logger } from '../utils/logger';
import { extractEmbeddedImagesFromPdfBuffer } from './document-extractor.service';

export interface AdditionalAnswerRegion {
  page: number;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  label?: string;
  segmentTitle?: string;
}

export interface AnswerRegionMap {
  questionNumber: string;
  page: number;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  confidence: number;
  label?: string;
  spansMultiplePages?: boolean;
  continuationNote?: string;
  additionalRegions?: AdditionalAnswerRegion[];
}

export interface SubmissionPageInfo {
  pageNumber: number;
  title: string;
  imageUrl?: string;
  imageType: 'custom-image' | 'handwritten-canvas';
}

export interface ExpectedQuestion {
  number: string;
  text: string;
  maxMarks?: number;
  questionType?: 'mcq' | 'short' | 'long' | 'diagram' | 'numerical';
  isMcq?: boolean;
}

export interface MappingResult {
  regions: AnswerRegionMap[];
  pages: SubmissionPageInfo[];
}

const normaliseQuestionNumber = (value: unknown): string => {
  const str = String(value || '').trim();
  const stripped = str.replace(/^(?:q(?:uestion)?|ans(?:wer)?)\s*[:.\-)]?\s*/i, '');
  return stripped.replace(/[^0-9a-z]/gi, '').toLowerCase();
};

const clamp = (value: unknown, lower: number, upper: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(lower, Math.min(upper, numeric)) : lower;
};

function resolveSubmissionPath(filePath: string): string {
  if (filePath.startsWith('/uploads/') || filePath.startsWith('uploads/') || filePath.startsWith('\\uploads\\') || filePath.startsWith('uploads\\')) {
    return path.resolve(process.cwd(), filePath.replace(/^[/\\]+/, ''));
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

/**
 * Extracts and prepares page buffers from image or PDF files.
 */
async function extractPageBuffers(
  filePath: string,
  fileType: string
): Promise<Array<{ pageNumber: number; buffer: Buffer; mimeType: string; relativeUrl?: string }>> {
  const resolved = resolveSubmissionPath(filePath);
  const ext = path.extname(resolved).toLowerCase();
  const isPdf = ext === '.pdf' || fileType.includes('pdf');
  const buffer = await fs.readFile(resolved);

  if (!isPdf) {
    const mimeType = fileType.includes('png') ? 'image/png' : fileType.includes('webp') ? 'image/webp' : 'image/jpeg';
    const relativeUrl = filePath.startsWith('/uploads/')
      ? filePath
      : `/uploads/${path.basename(resolved)}`;
    return [{ pageNumber: 1, buffer, mimeType, relativeUrl }];
  }

  // Handle PDF: Extract embedded page images (standard for scanned / mobile-uploaded answer sheets)
  const embeddedImages = extractEmbeddedImagesFromPdfBuffer(buffer);
  if (embeddedImages.length > 0) {
    const pagesDir = path.resolve(process.cwd(), 'uploads', 'pages');
    await fs.mkdir(pagesDir, { recursive: true }).catch(() => {});

    const stem = path.basename(resolved, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const result: Array<{ pageNumber: number; buffer: Buffer; mimeType: string; relativeUrl: string }> = [];

    for (let i = 0; i < embeddedImages.length; i++) {
      const pageNum = i + 1;
      const img = embeddedImages[i];
      const pageFilename = `${stem}_p${pageNum}.jpg`;
      const pageDiskPath = path.join(pagesDir, pageFilename);
      await fs.writeFile(pageDiskPath, img.buffer).catch(() => {});
      result.push({
        pageNumber: pageNum,
        buffer: img.buffer,
        mimeType: img.mimeType || 'image/jpeg',
        relativeUrl: `/uploads/pages/${pageFilename}`,
      });
    }
    return result;
  }

  // If no embedded raster images found, pass whole PDF or single reference
  const relativeUrl = filePath.startsWith('/uploads/')
    ? filePath
    : `/uploads/${path.basename(resolved)}`;
  return [{ pageNumber: 1, buffer, mimeType: 'application/pdf', relativeUrl }];
}

/**
 * Produces image-anchored answer regions for one or multiple pages.
 */
export async function mapAnswerRegions(
  filePath: string,
  fileType: string,
  expectedQuestions: ExpectedQuestion[]
): Promise<MappingResult> {
  if (!filePath || expectedQuestions.length === 0) {
    return { regions: [], pages: [] };
  }

  try {
    const pageBuffers = await extractPageBuffers(filePath, fileType);
    const pages: SubmissionPageInfo[] = pageBuffers.map((p) => ({
      pageNumber: p.pageNumber,
      title: `Page ${p.pageNumber}`,
      imageUrl: p.relativeUrl,
      imageType: 'custom-image',
    }));

    // Filter out multiple choice questions (MCQs). Only long / descriptive answers should be highlighted.
    const longQuestions = expectedQuestions.filter((q) => {
      if (q.isMcq || q.questionType === 'mcq') return false;
      if (q.maxMarks !== undefined && q.maxMarks <= 1) return false;
      if (/\b(multiple choice|mcq|choose the correct|select one)\b/i.test(q.text)) return false;
      return true;
    });

    if (longQuestions.length === 0) {
      logger.info('No long/descriptive questions to map; skipping bounding box extraction for MCQs.');
      return { regions: [], pages };
    }

    const expected = longQuestions.map((q) => ({
      number: q.number,
      text: q.text.slice(0, 180),
      maxMarks: q.maxMarks,
    }));
    const expectedNumbers = new Set(longQuestions.map((q) => normaliseQuestionNumber(q.number)));

    const allRegions: AnswerRegionMap[] = [];

    for (const pageItem of pageBuffers) {
      // Only process image buffers through AI vision layout mapper
      if (!pageItem.mimeType.startsWith('image/')) continue;

      try {
        const data = await AIOrchestrator.generate({
          intent: 'EvaluateAssignment',
          context: '',
          temperature: 0,
          responseFormat: { type: 'json_object' },
          media: [{ type: 'image_url', url: `data:${pageItem.mimeType};base64,${pageItem.buffer.toString('base64')}` }],
          taskInstructions: [
            `You are a document-layout OCR mapper analyzing Page ${pageItem.pageNumber} of a student handwritten answer sheet.`,
            'CRITICAL INSTRUCTION: DO NOT detect, map, or highlight Multiple Choice Questions (MCQs), single-letter answers (e.g. 1) C, 2) A), objective answers, or section headings.',
            'YOUR EXCLUSIVE TASK: Locate and highlight ONLY the handwritten descriptive / short / long answers with high-accuracy bounding boxes.',
            '',
            'For each expected question:',
            '1. Locate the written question number or anchor written by the student (e.g., "6)", "6.", "Ans 6", "Q6").',
            '2. Measure the physical bounding box covering the entire answer: start from the top of the question label/heading, extend down to the last line of ink of that answer (before the next question begins or the page ends), and span horizontally across the student\'s handwriting.',
            '3. Do NOT include other questions, do NOT include section headers (like "Short Answers :"), and do NOT include empty paper or margins.',
            '4. Coordinates MUST be percentages of the full image (0 to 100):',
            '   - leftPercent: horizontal start of ink (x)',
            '   - topPercent: vertical start of the answer ink (y)',
            '   - widthPercent: horizontal span of the handwriting',
            '   - heightPercent: vertical span from start of question to end of answer',
            `5. All bounding boxes on this image have page: ${pageItem.pageNumber}.`,
            '',
            `Expected long/descriptive questions to locate: ${JSON.stringify(expected)}`,
            `Return JSON: {"answerRegions":[{"questionNumber":"6","page":${pageItem.pageNumber},"topPercent":48.0,"leftPercent":6.0,"widthPercent":88.0,"heightPercent":20.0,"confidence":0.95,"additionalRegions":[]}]}`,
            'Omit any question that is not written on this page. Never create bounding boxes for MCQs.',
          ].join('\n'),
        });

        const rawRegions = Array.isArray(data?.answerRegions) ? data.answerRegions : [];

        const validForPage = rawRegions
          .filter((region: any) => expectedNumbers.has(normaliseQuestionNumber(region?.questionNumber)))
          .map((region: any): AnswerRegionMap | null => {
            const leftPercent = clamp(region.leftPercent, 0, 98);
            const topPercent = clamp(region.topPercent, 0, 98);
            const widthPercent = clamp(region.widthPercent, 2, 100 - leftPercent);
            const heightPercent = clamp(region.heightPercent, 1, 100 - topPercent);
            const confidence = clamp(region.confidence ?? 0.9, 0, 1);
            if (widthPercent < 2 || heightPercent < 1 || confidence < 0.6) return null;

            const addl = Array.isArray(region.additionalRegions)
              ? region.additionalRegions
                  .map((c: any) => ({
                    page: clamp(c.page ?? pageItem.pageNumber, 1, 99),
                    topPercent: clamp(c.topPercent, 0, 98),
                    leftPercent: clamp(c.leftPercent, 0, 98),
                    widthPercent: clamp(c.widthPercent, 2, 100),
                    heightPercent: clamp(c.heightPercent, 1, 100),
                    label: c.label ? String(c.label) : undefined,
                    segmentTitle: c.segmentTitle ? String(c.segmentTitle) : undefined,
                  }))
                  .filter((c: any) => c.widthPercent >= 2 && c.heightPercent >= 1)
              : undefined;

            return {
              questionNumber: String(region.questionNumber),
              page: pageItem.pageNumber,
              topPercent,
              leftPercent,
              widthPercent,
              heightPercent,
              confidence,
              label: `Q${region.questionNumber}`,
              spansMultiplePages: Boolean(addl && addl.some((c: any) => c.page !== pageItem.pageNumber)),
              additionalRegions: addl && addl.length > 0 ? addl : undefined,
            };
          })
          .filter(Boolean) as AnswerRegionMap[];

        allRegions.push(...validForPage);
      } catch (pageError) {
        logger.warn({ pageError, page: pageItem.pageNumber }, 'AI layout mapping failed for page');
      }
    }

    // Deduplicate and filter overlapping boxes on the same page
    const finalRegions = allRegions
      .sort((a, b) => b.confidence - a.confidence)
      .filter((candidate, idx, arr) => {
        // Discard candidate if it overlaps substantially with an already accepted box on the same page
        return !arr.slice(0, idx).some((accepted) => {
          if (accepted.page !== candidate.page) return false;
          const left = Math.max(candidate.leftPercent, accepted.leftPercent);
          const right = Math.min(candidate.leftPercent + candidate.widthPercent, accepted.leftPercent + accepted.widthPercent);
          const top = Math.max(candidate.topPercent, accepted.topPercent);
          const bottom = Math.min(candidate.topPercent + candidate.heightPercent, accepted.topPercent + accepted.heightPercent);
          const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
          const candidateArea = candidate.widthPercent * candidate.heightPercent;
          return candidateArea > 0 && overlap / candidateArea > 0.35;
        });
      })
      .sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        return a.topPercent - b.topPercent;
      });

    return { regions: finalRegions, pages };
  } catch (error) {
    logger.warn({ error, filePath }, 'Answer-sheet layout mapping failed; no estimated regions will be shown');
    return { regions: [], pages: [] };
  }
}
