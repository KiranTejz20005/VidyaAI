import { BloomLevel, type CourseSyllabusUnit, type Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { ApiError } from '../../api/common/errors';

export type SyllabusUnitInput = {
  id?: string;
  unitNumber: number;
  title: string;
  topics?: string[];
  coMapped?: string;
  bloomLevel?: BloomLevel | string;
  hours?: number;
  status?: string;
};

const BLOOM: BloomLevel[] = [
  'REMEMBER',
  'UNDERSTAND',
  'APPLY',
  'ANALYZE',
  'EVALUATE',
  'CREATE',
];

function normalizeBloom(value: string | BloomLevel | undefined): BloomLevel {
  const upper = String(value ?? 'UNDERSTAND').toUpperCase() as BloomLevel;
  return BLOOM.includes(upper) ? upper : 'UNDERSTAND';
}

function normalizeStatus(value: string | undefined): string {
  const s = String(value ?? 'UPCOMING').toUpperCase();
  if (s === 'COMPLETED' || s === 'IN_PROGRESS' || s === 'UPCOMING') return s;
  return 'UPCOMING';
}

async function assertCourseInOrg(courseId: string, organizationId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, organizationId },
    select: { id: true },
  });
  if (!course) throw ApiError.notFound('Course not found');
  return course;
}

export class SyllabusUnitService {
  static async listUnits(courseId: string, organizationId: string): Promise<CourseSyllabusUnit[]> {
    await assertCourseInOrg(courseId, organizationId);
    return prisma.courseSyllabusUnit.findMany({
      where: { courseId, organizationId },
      orderBy: { unitNumber: 'asc' },
    });
  }

  static async replaceUnits(
    courseId: string,
    organizationId: string,
    units: SyllabusUnitInput[],
  ): Promise<CourseSyllabusUnit[]> {
    await assertCourseInOrg(courseId, organizationId);

    const rows: Prisma.CourseSyllabusUnitCreateManyInput[] = units.map((u, index) => ({
      courseId,
      organizationId,
      unitNumber: u.unitNumber ?? index + 1,
      title: u.title.trim(),
      topics: Array.isArray(u.topics) ? u.topics.map(String) : [],
      coMapped: u.coMapped?.trim() ?? '',
      bloomLevel: normalizeBloom(u.bloomLevel),
      hours: typeof u.hours === 'number' && Number.isFinite(u.hours) ? Math.max(0, Math.round(u.hours)) : 0,
      status: normalizeStatus(u.status),
    }));

    return prisma.$transaction(async (tx) => {
      await tx.courseSyllabusUnit.deleteMany({ where: { courseId, organizationId } });
      if (rows.length > 0) {
        await tx.courseSyllabusUnit.createMany({ data: rows });
      }
      return tx.courseSyllabusUnit.findMany({
        where: { courseId, organizationId },
        orderBy: { unitNumber: 'asc' },
      });
    });
  }

  static async createUnit(
    courseId: string,
    organizationId: string,
    input: SyllabusUnitInput,
  ): Promise<CourseSyllabusUnit> {
    await assertCourseInOrg(courseId, organizationId);
    try {
      return await prisma.courseSyllabusUnit.create({
        data: {
          courseId,
          organizationId,
          unitNumber: input.unitNumber,
          title: input.title.trim(),
          topics: Array.isArray(input.topics) ? input.topics.map(String) : [],
          coMapped: input.coMapped?.trim() ?? '',
          bloomLevel: normalizeBloom(input.bloomLevel),
          hours:
            typeof input.hours === 'number' && Number.isFinite(input.hours)
              ? Math.max(0, Math.round(input.hours))
              : 0,
          status: normalizeStatus(input.status),
        },
      });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === 'P2002') throw ApiError.conflict(`Unit number ${input.unitNumber} already exists`);
      throw err;
    }
  }

  static async updateUnit(
    id: string,
    organizationId: string,
    input: Partial<SyllabusUnitInput>,
  ): Promise<CourseSyllabusUnit> {
    const existing = await prisma.courseSyllabusUnit.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw ApiError.notFound('Syllabus unit not found');

    try {
      return await prisma.courseSyllabusUnit.update({
        where: { id },
        data: {
          ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber } : {}),
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.topics !== undefined ? { topics: input.topics.map(String) } : {}),
          ...(input.coMapped !== undefined ? { coMapped: input.coMapped.trim() } : {}),
          ...(input.bloomLevel !== undefined ? { bloomLevel: normalizeBloom(input.bloomLevel) } : {}),
          ...(input.hours !== undefined
            ? { hours: Math.max(0, Math.round(Number(input.hours) || 0)) }
            : {}),
          ...(input.status !== undefined ? { status: normalizeStatus(input.status) } : {}),
        },
      });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === 'P2002') throw ApiError.conflict('Unit number already exists for this course');
      throw err;
    }
  }

  static async deleteUnit(id: string, organizationId: string): Promise<void> {
    const existing = await prisma.courseSyllabusUnit.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Syllabus unit not found');
    await prisma.courseSyllabusUnit.delete({ where: { id } });
  }
}
