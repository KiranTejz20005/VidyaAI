import { describe, it, expect } from 'vitest';
import { classifyDocument, runDocumentPipeline } from '../services/document-intel/pipeline';
import { setOcrProvider, defaultOcrProvider } from '../services/document-intel/ocr-provider';
import type { OcrProvider } from '../services/document-intel/types';
import { afterEach } from 'vitest';

afterEach(() => {
  setOcrProvider(defaultOcrProvider);
});

describe('document-intel classifyDocument', () => {
  it('detects handwritten answer sheets from filename hints', () => {
    expect(
      classifyDocument({
        mimeType: 'image/jpeg',
        filename: 'answer-sheet-scan.jpg',
        preferHandwriting: true,
      }),
    ).toBe('ANSWER_SHEET_HANDWRITTEN');
  });

  it('detects digital question papers', () => {
    expect(
      classifyDocument({
        mimeType: 'application/pdf',
        filename: 'midterm-question-paper.pdf',
      }),
    ).toBe('QUESTION_PAPER_DIGITAL');
  });
});

describe('document-intel runDocumentPipeline', () => {
  it('flags low-confidence OCR for human review and does not invent structure', async () => {
    const fake: OcrProvider = {
      name: 'fake',
      supportsHandwriting: true,
      supportsMath: false,
      async extract() {
        return { text: 'Q1', confidence: 0.2 };
      },
    };
    setOcrProvider(fake);
    const doc = await runDocumentPipeline({
      id: 'd1',
      organizationId: 'org1',
      originalFilename: 'sheet.jpg',
      mimeType: 'image/jpeg',
      storageKey: 'uploads/org1/sheet.jpg',
      buffer: Buffer.from('fake'),
      preferHandwriting: true,
    });
    expect(doc.reviewRequired).toBe(true);
    expect(doc.pages[0]?.lowConfidenceSpans?.length).toBeGreaterThan(0);
    const academic = doc.stages.find((s) => s.stage === 'ACADEMIC');
    expect(academic?.data).toEqual({ deferred: true });
  });

  it('refuses handwriting when provider cannot support it', async () => {
    setOcrProvider({
      name: 'text-only',
      supportsHandwriting: false,
      supportsMath: false,
      async extract() {
        return { text: 'x', confidence: 1 };
      },
    });
    const doc = await runDocumentPipeline({
      id: 'd2',
      organizationId: 'org1',
      originalFilename: 'hw.jpg',
      mimeType: 'image/jpeg',
      storageKey: 'k',
      buffer: Buffer.from('x'),
      preferHandwriting: true,
    });
    expect(doc.stages.some((s) => s.stage === 'OCR' && s.status === 'FAILED')).toBe(true);
    expect(doc.reviewRequired).toBe(true);
  });
});
