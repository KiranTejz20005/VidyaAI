export interface GradingConfigDto {
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

export interface CreateGradingConfigDto {
  answerKeyText: string;
  rubricId?: string;
  aiModel?: string;
  passingScore?: number;
  maxAttempts?: number;
  gradingType: 'AUTO' | 'MANUAL' | 'HYBRID';
}

export interface UpdateGradingConfigDto {
  answerKeyText?: string;
  rubricId?: string;
  aiModel?: string;
  passingScore?: number;
  maxAttempts?: number;
  gradingType?: 'AUTO' | 'MANUAL' | 'HYBRID';
}

export interface SubmissionDto {
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

export interface EvaluationDto {
  id: string;
  submissionId: string;
  score: number;
  totalMarks: number;
  generalFeedback: string;
  criteriaGrades: CriteriaGradeDto[];
  answerRegions?: any[];
  questions?: any[];
  pages?: any[];
  isOverridden?: boolean;
  teacherOverride?: unknown;
  submission?: { id: string; fileUrl: string; fileType: string };
  teacherFeedback?: string;
  studentText?: string;
  rubricCriteria?: any[];
  evaluatedAt: string;
  overriddenAt?: string;
  overrideReason?: string;
}

export interface CriteriaGradeDto {
  criterionId: string;
  criterionName: string;
  score: number;
  maxScore: number;
  explanation: string;
  /** @deprecated legacy alias of criterionId */
  criteriaId?: string;
  /** @deprecated legacy alias of criterionName */
  name?: string;
}

export interface GradeOverrideDto {
  score: number;
  reason: string;
  teacherFeedback?: string;
  criteriaGrades?: CriteriaGradeDto[];
}

export interface BulkEvaluateJobDto {
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
