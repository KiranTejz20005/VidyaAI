import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  aiPaperQuestionsSchema,
} from '../api/question-paper/analysis-validators';
import {
  buildAnalysisReport,
  extractQuestionsFromText,
  mergeAiSuggestions,
  parseMarksFromText,
} from '../services/question-paper/analysis.service';
import { setOcrProvider, defaultOcrProvider } from '../services/document-intel/ocr-provider';

vi.mock('../config/prisma', () => ({
  default: {
    documentProcessingJob: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    storedFile: { findFirst: vi.fn() },
  },
}));

import prisma from '../config/prisma';
import { startQuestionPaperAnalysis } from '../services/question-paper/analysis.service';

const SAMPLE_QP = `
1. Define osmosis and diffusion. [5 marks]
2. Explain the function of mitochondria.
   a) Structure (3 marks)
   b) Role in ATP synthesis (4 marks)
`;

describe('question-paper analysis heuristics', () => {
  it('parses trailing bracket marks', () => {
    const { marks, cleaned } = parseMarksFromText('State Newton laws (10 marks)');
    expect(marks).toBe(10);
    expect(cleaned).not.toMatch(/marks/i);
  });

  it('extracts numbered questions with marks distribution', () => {
    const questions = extractQuestionsFromText(SAMPLE_QP, 0.9);
    expect(questions.length).toBeGreaterThanOrEqual(2);
    const q1 = questions.find((q) => q.number === '1');
    expect(q1?.marks).toBe(5);
    expect(q1?.marksSource).toBe('detected');
    const report = buildAnalysisReport(
      questions,
      { reviewRequired: false, reviewReasons: [] },
      { kind: 'QUESTION_PAPER_DIGITAL', ocrConfidence: 0.9, pageCount: 1 },
    );
    expect(report.totals.questionCount).toBeGreaterThanOrEqual(2);
    expect(report.marksDistribution['5']).toBeGreaterThanOrEqual(1);
  });

  it('flags missing marks for review', () => {
    const questions = extractQuestionsFromText('3. Describe photosynthesis in detail.', 0.8);
    expect(questions[0]?.reviewStatus).toBe('NEEDS_REVIEW');
    expect(questions[0]?.marks).toBeUndefined();
  });
});

describe('question-paper analysis AI merge', () => {
  it('rejects malformed AI JSON via Zod', () => {
    const bad = { questions: [{ number: 1, text: '' }] };
    expect(aiPaperQuestionsSchema.safeParse(bad).success).toBe(false);
  });

  it('never marks CO suggestions as confirmed', () => {
    const heuristic = extractQuestionsFromText('1. Sample question [2 marks]', 0.85);
    const ai = aiPaperQuestionsSchema.parse({
      questions: [
        {
          number: '1',
          text: 'Sample question',
          marks: 2,
          confidence: 0.55,
          suggestedCoCode: 'CO1',
          topic: 'Cell biology',
          bloomLevel: 'Applying',
        },
      ],
    });
    const { questions } = mergeAiSuggestions(heuristic, ai, 0.85);
    const q = questions.find((x) => x.number === '1');
    expect(q?.suggestions?.courseOutcome?.confirmed).toBe(false);
    expect(q?.reviewStatus).toBe('SUGGESTION_ONLY');
  });

  it('accepts valid AI payload', () => {
    const payload = aiPaperQuestionsSchema.parse({
      questions: [{ number: '2', text: 'Valid stem', marks: 4, confidence: 0.9 }],
    });
    expect(payload.questions[0].marks).toBe(4);
  });
});

describe('question-paper analysis pipeline job', () => {
  beforeEach(() => {
    setOcrProvider({
      name: 'test-ocr',
      supportsHandwriting: true,
      supportsMath: false,
      async extract() {
        return { text: SAMPLE_QP, confidence: 0.92 };
      },
    });
    vi.mocked(prisma.documentProcessingJob.create).mockResolvedValue({ id: 'job-1' } as never);
    vi.mocked(prisma.documentProcessingJob.update).mockResolvedValue({} as never);
    vi.mocked(prisma.documentProcessingJob.findUnique).mockResolvedValue(null);
  });

  afterEach(() => {
    setOcrProvider(defaultOcrProvider);
    vi.clearAllMocks();
  });

  it('persists DocumentProcessingJob and returns structured report', async () => {
    const result = await startQuestionPaperAnalysis({
      organizationId: 'org-1',
      buffer: Buffer.from('pdf-bytes'),
      filename: 'midterm-question-paper.pdf',
      mimeType: 'application/pdf',
      storageKey: 'uploads/org-1/qp.pdf',
      useAiEnrichment: false,
    });

    expect(result.jobId).toBeTruthy();
    expect(result.report.questions.length).toBeGreaterThan(0);
    expect(result.report.totals).toMatchObject({
      questionCount: expect.any(Number),
      marksTotal: expect.any(Number),
    });
    expect(prisma.documentProcessingJob.create).toHaveBeenCalled();
    expect(prisma.documentProcessingJob.update).toHaveBeenCalled();
  });
});