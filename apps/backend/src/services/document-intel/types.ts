/**
 * Shared contracts for the academic document intelligence pipeline.
 * Stages are independently testable; uncertain text is never silently dropped.
 */

export type DocumentKind =
  | 'UNKNOWN'
  | 'QUESTION_PAPER_DIGITAL'
  | 'QUESTION_PAPER_SCANNED'
  | 'QUESTION_PAPER_HANDWRITTEN'
  | 'ANSWER_SHEET_HANDWRITTEN'
  | 'ANSWER_SHEET_TYPED'
  | 'SYLLABUS'
  | 'OTHER';

export type PipelineStage =
  | 'UPLOAD'
  | 'VALIDATE'
  | 'STORE'
  | 'CLASSIFY'
  | 'PAGE_PROCESS'
  | 'OCR'
  | 'LAYOUT'
  | 'STRUCTURE'
  | 'ACADEMIC'
  | 'CONFIDENCE'
  | 'HUMAN_REVIEW'
  | 'FINALIZE';

export type StageStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'NEEDS_REVIEW';

export interface SourceRef {
  storageKey: string;
  pageNo?: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface StageResult<T = unknown> {
  stage: PipelineStage;
  status: StageStatus;
  confidence?: number;
  error?: string;
  data?: T;
  sourceRefs?: SourceRef[];
  startedAt: string;
  finishedAt?: string;
}

export interface PipelineDocument {
  id: string;
  organizationId: string;
  originalFilename: string;
  mimeType: string;
  storageKey: string;
  kind: DocumentKind;
  pages: PipelinePage[];
  stages: StageResult[];
  reviewRequired: boolean;
  reviewReasons: string[];
}

export interface PipelinePage {
  pageNo: number;
  storageKey: string;
  width?: number;
  height?: number;
  orientation?: 'portrait' | 'landscape' | 'unknown';
  text?: string;
  ocrConfidence?: number;
  lowConfidenceSpans?: Array<{ text: string; confidence: number; source: SourceRef }>;
}

export interface OcrProvider {
  readonly name: string;
  supportsHandwriting: boolean;
  supportsMath: boolean;
  extract(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
    preferHandwriting?: boolean;
  }): Promise<{
    text: string;
    confidence: number;
    pages?: Array<{ pageNo: number; text: string; confidence: number }>;
  }>;
}

export const PIPELINE_ORDER: PipelineStage[] = [
  'UPLOAD',
  'VALIDATE',
  'STORE',
  'CLASSIFY',
  'PAGE_PROCESS',
  'OCR',
  'LAYOUT',
  'STRUCTURE',
  'ACADEMIC',
  'CONFIDENCE',
  'HUMAN_REVIEW',
  'FINALIZE',
];
