-- Course-scoped syllabus units for OBE (server source of truth; replaces client localStorage).

CREATE TABLE IF NOT EXISTS "CourseSyllabusUnit" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coMapped" TEXT NOT NULL DEFAULT '',
    "bloomLevel" "BloomLevel" NOT NULL DEFAULT 'UNDERSTAND',
    "hours" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSyllabusUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CourseSyllabusUnit_courseId_unitNumber_key"
  ON "CourseSyllabusUnit"("courseId", "unitNumber");

CREATE INDEX IF NOT EXISTS "CourseSyllabusUnit_courseId_idx"
  ON "CourseSyllabusUnit"("courseId");

CREATE INDEX IF NOT EXISTS "CourseSyllabusUnit_organizationId_idx"
  ON "CourseSyllabusUnit"("organizationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CourseSyllabusUnit_courseId_fkey'
  ) THEN
    ALTER TABLE "CourseSyllabusUnit"
      ADD CONSTRAINT "CourseSyllabusUnit_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
