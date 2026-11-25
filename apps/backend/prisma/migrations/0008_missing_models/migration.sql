-- Brings the migration history in line with schema.prisma.
-- Every statement is guarded so it also applies cleanly to databases that were
-- previously created with `prisma db push`.

DO $$ BEGIN
  CREATE TYPE "ArtifactStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BlueprintItemType" AS ENUM ('OBJECTIVE', 'SHORT_ANSWER', 'LONG_ANSWER', 'PRACTICAL', 'MCQ');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Blueprint" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "courseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "totalMarks" INTEGER NOT NULL DEFAULT 100,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlueprintItem" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "coId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "marks" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "bloomLevel" "BloomLevel" NOT NULL,
    "itemType" "BlueprintItemType" NOT NULL DEFAULT 'MCQ',
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlueprintItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "ArtifactStatus" NOT NULL,
    "comments" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MappingReview" (
    "id" TEXT NOT NULL,
    "coPoMappingId" TEXT NOT NULL,
    "previousWeightage" INTEGER,
    "newWeightage" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MappingReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StoredFile" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "entityId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Course_departmentId_idx" ON "Course"("departmentId");

CREATE INDEX IF NOT EXISTS "Course_organizationId_idx" ON "Course"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "Course_code_organizationId_key" ON "Course"("code", "organizationId");

CREATE INDEX IF NOT EXISTS "Program_organizationId_idx" ON "Program"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "Program_code_organizationId_key" ON "Program"("code", "organizationId");

CREATE INDEX IF NOT EXISTS "Blueprint_courseId_idx" ON "Blueprint"("courseId");

CREATE INDEX IF NOT EXISTS "Blueprint_organizationId_idx" ON "Blueprint"("organizationId");

CREATE INDEX IF NOT EXISTS "Blueprint_status_idx" ON "Blueprint"("status");

CREATE INDEX IF NOT EXISTS "BlueprintItem_blueprintId_idx" ON "BlueprintItem"("blueprintId");

CREATE INDEX IF NOT EXISTS "BlueprintItem_coId_idx" ON "BlueprintItem"("coId");

CREATE INDEX IF NOT EXISTS "ApprovalRecord_entityType_entityId_idx" ON "ApprovalRecord"("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "ApprovalRecord_organizationId_idx" ON "ApprovalRecord"("organizationId");

CREATE INDEX IF NOT EXISTS "ApprovalRecord_status_idx" ON "ApprovalRecord"("status");

CREATE INDEX IF NOT EXISTS "MappingReview_coPoMappingId_idx" ON "MappingReview"("coPoMappingId");

CREATE UNIQUE INDEX IF NOT EXISTS "StoredFile_key_key" ON "StoredFile"("key");

CREATE INDEX IF NOT EXISTS "StoredFile_ownerId_idx" ON "StoredFile"("ownerId");

CREATE INDEX IF NOT EXISTS "StoredFile_organizationId_idx" ON "StoredFile"("organizationId");

CREATE INDEX IF NOT EXISTS "StoredFile_scope_entityId_idx" ON "StoredFile"("scope", "entityId");

ALTER TABLE "SubmissionEvaluation" ADD COLUMN IF NOT EXISTS "isOverridden" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SubmissionEvaluation" ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;

ALTER TABLE "SubmissionEvaluation" ADD COLUMN IF NOT EXISTS "teacherFeedback" TEXT;

ALTER TABLE "SubmissionEvaluation" ADD COLUMN IF NOT EXISTS "overriddenBy" TEXT;

ALTER TABLE "SubmissionEvaluation" ADD COLUMN IF NOT EXISTS "overriddenAt" TIMESTAMP(3);

ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'HANDOUT';

ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "CoPoMapping" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  ALTER TABLE "Course" ADD CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Course" ADD CONSTRAINT "Course_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Program" ADD CONSTRAINT "Program_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Blueprint" ADD CONSTRAINT "Blueprint_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Blueprint" ADD CONSTRAINT "Blueprint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BlueprintItem" ADD CONSTRAINT "BlueprintItem_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BlueprintItem" ADD CONSTRAINT "BlueprintItem_coId_fkey" FOREIGN KEY ("coId") REFERENCES "CourseOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MappingReview" ADD CONSTRAINT "MappingReview_coPoMappingId_fkey" FOREIGN KEY ("coPoMappingId") REFERENCES "CoPoMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
