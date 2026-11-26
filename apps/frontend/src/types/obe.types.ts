export interface Course {
  id: string;
  name: string;
  code: string;
  description: string | null;
  departmentId: string | null;
  organizationId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: { outcomes: number; blueprints: number };
}

export interface Program {
  id: string;
  name: string;
  code: string;
  description: string | null;
  organizationId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: { outcomes: number };
}

export interface CourseOutcome {
  id: string;
  code: string;
  description: string;
  bloomLevel: string;
  courseId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  coMappings?: CoPoMapping[];
}

export interface ProgramOutcome {
  id: string;
  code: string;
  description: string;
  programId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  poMappings?: CoPoMapping[];
}

export interface CoPoMapping {
  id: string;
  coId: string;
  poId: string;
  weightage: number;
  createdAt: string;
  updatedAt: string;
  po?: ProgramOutcome;
  co?: CourseOutcome;
  reviews?: MappingReview[];
}

export interface MappingReview {
  id: string;
  coPoMappingId: string;
  previousWeightage: number | null;
  newWeightage: number;
  reason: string;
  changedById: string | null;
  createdAt: string;
}

export interface CurriculumGraph {
  course: Course;
  courseOutcomes: CourseOutcome[];
  programOutcomes: ProgramOutcome[];
  mappingMatrix: MappingMatrixRow[];
}

export interface MappingMatrixRow {
  coId: string;
  coCode: string;
  bloomLevel: string;
  mappings: Array<{ poId: string; poCode: string; weightage: number }>;
}

export interface Blueprint {
  id: string;
  title: string;
  description: string | null;
  courseId: string;
  organizationId: string;
  totalMarks: number;
  status: string;
  version: number;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: BlueprintItem[];
  course?: Course;
  _count?: { items: number };
}

export interface BlueprintItem {
  id: string;
  blueprintId: string;
  coId: string;
  title: string;
  marks: number;
  count: number;
  bloomLevel: string;
  itemType: string;
  topic: string | null;
  createdAt: string;
  updatedAt: string;
  co?: CourseOutcome;
}

export interface BlueprintValidation {
  valid: boolean;
  issues: Array<{ type: string; message: string; severity: string }>;
  totalItemMarks: number;
  coCoverage: number;
  bloomDistribution: Record<string, number>;
}

export interface CoAttainmentResult {
  coId: string;
  coCode: string;
  description: string;
  bloomLevel: string;
  attainment: number;
  threshold: number;
  metThreshold: boolean;
}

export interface CoAttainmentResponse {
  courseId: string;
  courseName: string;
  threshold: number;
  outcomes: CoAttainmentResult[];
  overallAttainment: number;
  flaggedCos: CoAttainmentResult[];
}

export interface PoAttainmentResult {
  poId: string;
  poCode: string;
  description: string;
  attainment: number;
  threshold: number;
  metThreshold: boolean;
  contributingCOs: number;
}

export interface PoAttainmentResponse {
  threshold: number;
  programOutcomes: PoAttainmentResult[];
  overallAttainment: number;
  flaggedPos: PoAttainmentResult[];
}

export interface AttainmentDashboard {
  course: CoAttainmentResponse;
  program: PoAttainmentResponse;
  summary: {
    totalCOs: number;
    cosMeetingTarget: number;
    totalPOs: number;
    posMeetingTarget: number;
  };
}

export interface MappingIntegrity {
  valid: boolean;
  issues: Array<{ type: string; coId?: string; coCode?: string; message: string }>;
  totalCOs: number;
  mappedCOs: number;
  totalPOs: number;
  mappedPOs: number;
}

export interface CreateCourseData {
  name: string;
  code: string;
  description?: string;
  departmentId?: string;
}

export interface CreateProgramData {
  name: string;
  code: string;
  description?: string;
}

export interface CreateCourseOutcomeData {
  code: string;
  description: string;
  bloomLevel: string;
}

export interface CreateProgramOutcomeData {
  code: string;
  description: string;
}

export interface UpsertCoPoMappingData {
  coId: string;
  poId: string;
  weightage: number;
  reason?: string;
}

export interface CreateBlueprintData {
  title: string;
  description?: string;
  courseId: string;
  totalMarks: number;
  items?: Array<{
    coId: string;
    title: string;
    marks: number;
    count?: number;
    bloomLevel: string;
    itemType?: string;
    topic?: string;
  }>;
}

export interface AddBlueprintItemData {
  coId: string;
  title: string;
  marks: number;
  count?: number;
  bloomLevel: string;
  itemType?: string;
  topic?: string;
}

export interface CoPoMatrixResponse {
  course: {
    id: string;
    name: string;
    code: string;
    description?: string | null;
  };
  cos: Array<{
    id: string;
    code: string;
    description: string;
    bloomLevel: string;
  }>;
  pos: Array<{
    id: string;
    code: string;
    description: string;
  }>;
  matrix: MappingMatrixRow[];
  bloomClassifications: Array<{
    coId: string;
    coCode: string;
    predictedLevel: string;
    effectiveLevel: string;
    confidence: number;
    cues: {
      verbs: string[];
      operations: string[];
      responseType: string;
    };
    explanation: string;
  }>;
  version?: number;
}

export interface UpdateCoPoMatrixData {
  mappings?: Array<{ coId: string; poId: string; weightage: number }>;
  bloomOverrides?: Array<{ coId: string; bloomLevel: string }>;
  reason?: string;
}

export interface GeneratedBlueprintPayload {
  title: string;
  totalMarks?: number;
  examType?: string;
  units?: unknown[];
  courseName?: string;
  courseCode?: string;
  cos?: unknown[];
}

export interface CourseSyllabusUnit {
  id: string;
  courseId: string;
  organizationId: string;
  unitNumber: number;
  title: string;
  topics: string[];
  coMapped: string;
  bloomLevel: string;
  hours: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'UPCOMING' | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReplaceSyllabusUnitsData {
  units: Array<{
    id?: string;
    unitNumber: number;
    title: string;
    topics: string[];
    coMapped?: string;
    bloomLevel?: string;
    hours?: number;
    status?: string;
  }>;
}

export interface GeneratedExamBlueprint {
  id: string;
  title: string;
  examType: string;
  duration: string;
  totalMarks: number;
  difficulty: 'EASY' | 'MODERATE' | 'CHALLENGING' | string;
  status: string;
  createdAt: string;
  sections: Array<{
    sectionName: string;
    instructions: string;
    totalSectionMarks: number;
    questions: Array<{
      id: string;
      qNo: string;
      questionText: string;
      coId: string;
      bloomLevel: string;
      marks: number;
      isChoice?: boolean;
    }>;
  }>;
  bloomDistribution: {
    rememberUnderstand: number;
    applyAnalyze: number;
    evaluateCreate: number;
  };
  coMarksDistribution: Record<string, number>;
  validation?: Partial<BlueprintValidation>;
}
