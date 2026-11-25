import { extractTextFromFileBuffer } from '../document-extractor.service';
import type { OcrProvider } from './types';
import { logger } from '../../utils/logger';

/**
 * Default OCR adapter wrapping the existing document extractor.
 * Vision/handwriting paths inside extractTextFromFileBuffer are preserved;
 * callers that require handwriting must set preferHandwriting and check confidence.
 */
export const defaultOcrProvider: OcrProvider = {
  name: 'document-extractor',
  supportsHandwriting: true,
  supportsMath: false,

  async extract({ buffer, mimeType, filename, preferHandwriting }) {
    if (preferHandwriting && !this.supportsHandwriting) {
      throw new Error(`OCR provider ${this.name} cannot handle handwriting for ${filename}`);
    }
    try {
      const text = await extractTextFromFileBuffer(buffer, filename, mimeType);
      const trimmed = (text || '').trim();
      // Heuristic confidence: empty → 0; short scanned output → low; else mid-high until real OCR scores exist
      let confidence = 0;
      if (trimmed.length > 400) confidence = 0.85;
      else if (trimmed.length > 80) confidence = 0.7;
      else if (trimmed.length > 0) confidence = 0.45;
      return { text: trimmed, confidence };
    } catch (err) {
      logger.error({ err, filename }, '[document-intel] OCR failed');
      throw err;
    }
  },
};

let activeProvider: OcrProvider = defaultOcrProvider;

export function getOcrProvider(): OcrProvider {
  return activeProvider;
}

/** Test/ops hook — never silently swap to a weaker provider for handwriting tasks. */
export function setOcrProvider(provider: OcrProvider): void {
  activeProvider = provider;
}
