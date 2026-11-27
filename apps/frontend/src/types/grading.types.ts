export interface GradingConfig {
  id: string;
  assignmentId: string;
  answerKeyText: string;
  questionPaperName?: string;
  autoEvaluate?: boolean;
  rubricId?: string;
  aiModel?: string;
  passingScore?: number;
  maxAttempts?: number;
  gradingType: 'AUTO' | 'MANUAL' | 'HYBRID';
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateGradingConfigData {
  answerKeyText: string;
  rubricId?: string | null;
  autoEvaluate?: boolean;
  aiModel?: string;
  passingScore?: number;
  maxAttempts?: number;
  gradingType?: 'AUTO' | 'MANUAL' | 'HYBRID';
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName?: string;
  fileUrl: string;
  fileType: string;
  status: 'PENDING' | 'GRADED' | 'FAILED';
  submittedAt: string;
  evaluatedAt?: string;
  score?: number;
  totalMarks?: number;
  evaluations?: Array<{ score: number; totalMarks?: number }>;
}

export interface CriteriaGrade {
  criterionId: string;
  criterionName: string;
  score: number;
  maxScore: number;
  explanation: string;
}

export interface Evaluation {
  id: string;
  submissionId: string;
  score: number;
  totalMarks: number;
  generalFeedback: string;
  criteriaGrades: CriteriaGrade[];
  evaluatedAt: string;
  overriddenAt?: string;
  overrideReason?: string;
  teacherFeedback?: string;
  /** Staff-only: extracted student answer text. */
  studentText?: string;
  /** Staff-only: criteria of the rubric attached to the assignment. */
  rubricCriteria?: Array<{ id: string; name: string; maxMarks: number }>;
}

export interface GradeOverrideData {
  score: number;
  reason: string;
  teacherFeedback?: string;
  criteriaGrades?: CriteriaGrade[];
}

export interface BulkEvaluateJob {
  jobId: string;
  assignmentId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  completed: number;
  failed: number;
  errors?: string[];
  createdAt: string;
  completedAt?: string;
}

/** Aggregated buckets for the teacher bulk review dashboard */
export interface BulkReviewStatusCounts {
  total: number;
  pendingProcessing: number;
  processing: number;
  evaluated: number;
  failed: number;
  awaitingReview: number;
  finalized: number;
}

export type BulkReviewBucket =
  | 'pending_processing'
  | 'processing'
  | 'evaluated'
  | 'failed'
  | 'awaiting_review'
  | 'finalized';
