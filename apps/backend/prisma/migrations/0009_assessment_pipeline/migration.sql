-- Assessment pipeline models + Assignment/User fields.
-- Guarded for databases previously created with prisma db push.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "assessmentMode" TEXT NOT NULL DEFAULT 'DIGITAL';
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "courseId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Assignment"
    ADD CONSTRAINT "Assignment_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Assignment_courseId_idx" ON "Assignment"("courseId");

CREATE TABLE IF NOT EXISTS "DocumentProcessingJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "error" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentProcessingJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentProcessingJob_idempotencyKey_key" ON "DocumentProcessingJob"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "DocumentProcessingJob_organizationId_idx" ON "DocumentProcessingJob"("organizationId");
CREATE INDEX IF NOT EXISTS "DocumentProcessingJob_status_idx" ON "DocumentProcessingJob"("status");

DO $$ BEGIN
  ALTER TABLE "DocumentProcessingJob"
    ADD CONSTRAINT "DocumentProcessingJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AnswerSheetPage" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "orientation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnswerSheetPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnswerSheetPage_submissionId_pageNo_key" ON "AnswerSheetPage"("submissionId", "pageNo");
CREATE INDEX IF NOT EXISTS "AnswerSheetPage_submissionId_idx" ON "AnswerSheetPage"("submissionId");

DO $$ BEGIN
  ALTER TABLE "AnswerSheetPage"
    ADD CONSTRAINT "AnswerSheetPage_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "StudentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ExtractedAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionLabel" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "struckText" TEXT,
    "ocrConfidence" DOUBLE PRECISION,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "pageNo" INTEGER,
    "bbox" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtractedAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExtractedAnswer_submissionId_idx" ON "ExtractedAnswer"("submissionId");
CREATE INDEX IF NOT EXISTS "ExtractedAnswer_submissionId_reviewStatus_idx" ON "ExtractedAnswer"("submissionId", "reviewStatus");

DO $$ BEGIN
  ALTER TABLE "ExtractedAnswer"
    ADD CONSTRAINT "ExtractedAnswer_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "StudentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EvaluationRevision" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EvaluationRevision_evaluationId_idx" ON "EvaluationRevision"("evaluationId");
CREATE INDEX IF NOT EXISTS "EvaluationRevision_actorId_idx" ON "EvaluationRevision"("actorId");

DO $$ BEGIN
  ALTER TABLE "EvaluationRevision"
    ADD CONSTRAINT "EvaluationRevision_evaluationId_fkey"
    FOREIGN KEY ("evaluationId") REFERENCES "SubmissionEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EvaluationRevision"
    ADD CONSTRAINT "EvaluationRevision_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BulkAssessmentJob" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "succeeded" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "pending" INTEGER NOT NULL,
    "awaitingReview" INTEGER NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkAssessmentJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BulkAssessmentJob_assignmentId_idx" ON "BulkAssessmentJob"("assignmentId");
CREATE INDEX IF NOT EXISTS "BulkAssessmentJob_organizationId_idx" ON "BulkAssessmentJob"("organizationId");
CREATE INDEX IF NOT EXISTS "BulkAssessmentJob_status_idx" ON "BulkAssessmentJob"("status");
CREATE INDEX IF NOT EXISTS "BulkAssessmentJob_createdById_idx" ON "BulkAssessmentJob"("createdById");

DO $$ BEGIN
  ALTER TABLE "BulkAssessmentJob"
    ADD CONSTRAINT "BulkAssessmentJob_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BulkAssessmentJob"
    ADD CONSTRAINT "BulkAssessmentJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BulkAssessmentJob"
    ADD CONSTRAINT "BulkAssessmentJob_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
