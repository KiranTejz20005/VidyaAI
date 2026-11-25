import { getOcrProvider } from './ocr-provider';
import type {
  DocumentKind,
  PipelineDocument,
  PipelinePage,
  PipelineStage,
  StageResult,
} from './types';
import { PIPELINE_ORDER } from './types';

const LOW_OCR = 0.75;

function stageResult<T>(
  stage: PipelineStage,
  status: StageResult['status'],
  extra: Partial<StageResult<T>> = {},
): StageResult<T> {
  return {
    stage,
    status,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ...extra,
  };
}

export function classifyDocument(input: {
  mimeType: string;
  filename: string;
  textSample?: string;
  preferHandwriting?: boolean;
}): DocumentKind {
  const name = input.filename.toLowerCase();
  const mime = input.mimeType.toLowerCase();
  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(name);
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
  if (input.preferHandwriting || /answer[-_]?sheet|handwrit/i.test(name)) {
    return isImage || isPdf ? 'ANSWER_SHEET_HANDWRITTEN' : 'ANSWER_SHEET_TYPED';
  }
  if (/question[-_]?paper|qp[_-]/i.test(name)) {
    if (input.preferHandwriting) return 'QUESTION_PAPER_HANDWRITTEN';
    if (isImage) return 'QUESTION_PAPER_SCANNED';
    return 'QUESTION_PAPER_DIGITAL';
  }
  if (/syllabus/i.test(name)) return 'SYLLABUS';
  if (isImage) return 'QUESTION_PAPER_SCANNED';
  return 'UNKNOWN';
}

export interface RunPipelineInput {
  id: string;
  organizationId: string;
  originalFilename: string;
  mimeType: string;
  storageKey: string;
  buffer: Buffer;
  preferHandwriting?: boolean;
}

/**
 * Runs validate → classify → OCR → confidence. Later stages (layout/structure/academic)
 * attach empty SUCCEEDED placeholders until dedicated extractors land — they never invent content.
 */
export async function runDocumentPipeline(input: RunPipelineInput): Promise<PipelineDocument> {
  const stages: StageResult[] = [];
  const reviewReasons: string[] = [];

  if (!input.buffer?.length) {
    stages.push(stageResult('VALIDATE', 'FAILED', { error: 'Empty upload' }));
    return {
      id: input.id,
      organizationId: input.organizationId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      storageKey: input.storageKey,
      kind: 'UNKNOWN',
      pages: [],
      stages,
      reviewRequired: true,
      reviewReasons: ['Empty upload'],
    };
  }
  stages.push(stageResult('VALIDATE', 'SUCCEEDED'));
  stages.push(stageResult('STORE', 'SUCCEEDED', { sourceRefs: [{ storageKey: input.storageKey }] }));

  const kind = classifyDocument({
    mimeType: input.mimeType,
    filename: input.originalFilename,
    preferHandwriting: input.preferHandwriting,
  });
  stages.push(stageResult('CLASSIFY', 'SUCCEEDED', { data: { kind }, confidence: 0.6 }));

  const ocr = getOcrProvider();
  const needsHandwriting =
    kind === 'ANSWER_SHEET_HANDWRITTEN' || kind === 'QUESTION_PAPER_HANDWRITTEN';
  if (needsHandwriting && !ocr.supportsHandwriting) {
    stages.push(
      stageResult('OCR', 'FAILED', {
        error: `Provider ${ocr.name} cannot process handwriting; refusing silent fallback`,
      }),
    );
    return {
      id: input.id,
      organizationId: input.organizationId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      storageKey: input.storageKey,
      kind,
      pages: [],
      stages,
      reviewRequired: true,
      reviewReasons: ['No handwriting-capable OCR provider'],
    };
  }

  let pages: PipelinePage[] = [];
  try {
    const result = await ocr.extract({
      buffer: input.buffer,
      mimeType: input.mimeType,
      filename: input.originalFilename,
      preferHandwriting: needsHandwriting,
    });
    if (result.pages?.length) {
      pages = result.pages.map((p) => ({
        pageNo: p.pageNo,
        storageKey: input.storageKey,
        text: p.text,
        ocrConfidence: p.confidence,
        lowConfidenceSpans:
          p.confidence < LOW_OCR
            ? [{ text: p.text, confidence: p.confidence, source: { storageKey: input.storageKey, pageNo: p.pageNo } }]
            : undefined,
      }));
    } else {
      pages = [
        {
          pageNo: 1,
          storageKey: input.storageKey,
          text: result.text,
          ocrConfidence: result.confidence,
          lowConfidenceSpans:
            result.confidence < LOW_OCR
              ? [{ text: result.text, confidence: result.confidence, source: { storageKey: input.storageKey, pageNo: 1 } }]
              : undefined,
        },
      ];
    }
    const conf = result.confidence;
    stages.push(stageResult('OCR', conf < LOW_OCR ? 'NEEDS_REVIEW' : 'SUCCEEDED', { confidence: conf }));
    if (conf < LOW_OCR) reviewReasons.push(`OCR confidence ${conf.toFixed(2)} below ${LOW_OCR}`);
  } catch (err) {
    stages.push(
      stageResult('OCR', 'FAILED', {
        error: err instanceof Error ? err.message : 'OCR failed',
      }),
    );
    reviewReasons.push('OCR failed');
  }

  // Placeholders: no fabricated structure/academic mappings
  for (const stage of ['PAGE_PROCESS', 'LAYOUT', 'STRUCTURE', 'ACADEMIC'] as PipelineStage[]) {
    if (!PIPELINE_ORDER.includes(stage)) continue;
    stages.push(stageResult(stage, pages.length ? 'SUCCEEDED' : 'SKIPPED', { data: { deferred: true } }));
  }

  const reviewRequired = reviewReasons.length > 0;
  stages.push(
    stageResult('CONFIDENCE', reviewRequired ? 'NEEDS_REVIEW' : 'SUCCEEDED', {
      data: { reviewReasons },
    }),
  );
  if (reviewRequired) {
    stages.push(stageResult('HUMAN_REVIEW', 'PENDING', { data: { reviewReasons } }));
  } else {
    stages.push(stageResult('HUMAN_REVIEW', 'SKIPPED'));
    stages.push(stageResult('FINALIZE', 'SUCCEEDED'));
  }

  return {
    id: input.id,
    organizationId: input.organizationId,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    storageKey: input.storageKey,
    kind,
    pages,
    stages,
    reviewRequired,
    reviewReasons,
  };
}
