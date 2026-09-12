export interface AdditionalAnswerRegion {
  page: number;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  label?: string;
  segmentTitle?: string;
}

export interface AnswerRegion {
  page: number; // 1-indexed page
  topPercent: number; // 0 to 100
  leftPercent: number; // 0 to 100
  widthPercent: number; // 0 to 100
  heightPercent: number; // 0 to 100
  label?: string;
  spansMultiplePages?: boolean;
  continuationNote?: string;
  additionalRegions?: AdditionalAnswerRegion[];
}

export interface QuestionItem {
  id: string;
  number: string; // e.g. "1", "2", "11 a.", "11 b.", "11 (a)", "11 (b)"
  mainNumber: string; // e.g. "1", "2", "11"
  subPart?: string; // e.g. "a", "b"
  text: string;
  maxMarks: number;
  marksAwarded: number;
  status: 'answered' | 'unanswered' | 'partial' | 'incorrect' | 'unmatched';
  aiFeedback: string;
  suggestedSolution?: string;
  studentAnswerText?: string;
  orderInAnswerSheet?: number;
  isOutOfOrder?: boolean;
  answerRegion?: AnswerRegion;
  keyConcepts?: string[];
  section?: string;
  questionType?: 'mcq' | 'short' | 'long' | 'diagram' | 'numerical';
  criteriaBreakdown?: {
    criterion: string;
    marks: number;
    maxMarks: number;
  }[];
}

export interface OcrQuestion {
  id: string;
  number: string;
  mainNumber: string;
  subPart?: string;
  text: string;
  maxMarks: number;
  section?: string;
  type?: 'mcq' | 'short' | 'long' | 'diagram' | 'numerical';
  keyConcepts?: string[];
  confidence?: number;
  rawSnippet?: string;
}

export interface OcrResultData {
  rawOcrText: string;
  examTitle: string;
  subject: string;
  grade: string;
  totalMarks: number;
  ocrEngine: string;
  confidenceScore: number;
  extractedQuestions: OcrQuestion[];
  sections: { name: string; instructions?: string; totalMarks?: number }[];
}

export interface UnmatchedAnswerItem {
  id: string;
  label: string;
  page: number;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  extractedText: string;
  aiNote: string;
}

export interface AnswerSheetPage {
  pageNumber: number;
  title: string;
  imageType?: 'handwritten-canvas' | 'custom-image';
  imageUrl?: string;
}

export interface AssessmentData {
  id: string;
  title: string;
  subject: string;
  grade: string;
  studentName: string;
  rollNumber: string;
  school: string;
  date: string;
  totalMarksAwarded: number;
  maxTotalMarks: number;
  questionPaperFile: {
    name: string;
    size: string;
    pages: number;
  };
  answerSheetFile: {
    name: string;
    size: string;
    pages: number;
  };
  questions: QuestionItem[];
  unmatchedAnswers: UnmatchedAnswerItem[];
  pages: AnswerSheetPage[];
  ocrResult?: OcrResultData;
}

