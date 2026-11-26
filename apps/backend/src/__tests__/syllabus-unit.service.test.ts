import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyllabusUnitService } from '../services/obe/syllabus-unit.service';

vi.mock('../config/prisma', () => {
  const courseId = '11111111-1111-1111-1111-111111111111';
  const orgId = '22222222-2222-2222-2222-222222222222';

  const stored: Array<{
    id: string;
    courseId: string;
    organizationId: string;
    unitNumber: number;
    title: string;
    topics: string[];
    coMapped: string;
    bloomLevel: string;
    hours: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const courseSyllabusUnit = {
    findMany: vi.fn().mockImplementation(
      ({ where, orderBy }: { where: { courseId: string; organizationId: string }; orderBy?: { unitNumber: string } }) => {
        let rows = stored.filter((u) => u.courseId === where.courseId && u.organizationId === where.organizationId);
        if (orderBy?.unitNumber === 'asc') {
          rows = [...rows].sort((a, b) => a.unitNumber - b.unitNumber);
        }
        return Promise.resolve(rows);
      },
    ),
    deleteMany: vi.fn().mockImplementation(({ where }: { where: { courseId: string; organizationId: string } }) => {
      const before = stored.length;
      for (let i = stored.length - 1; i >= 0; i -= 1) {
        const row = stored[i];
        if (row.courseId === where.courseId && row.organizationId === where.organizationId) {
          stored.splice(i, 1);
        }
      }
      return Promise.resolve({ count: before - stored.length });
    }),
    createMany: vi.fn().mockImplementation(({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const row of data) {
        stored.push({
          id: `unit-${stored.length + 1}`,
          courseId: String(row.courseId),
          organizationId: String(row.organizationId),
          unitNumber: Number(row.unitNumber),
          title: String(row.title),
          topics: (row.topics as string[]) ?? [],
          coMapped: String(row.coMapped ?? ''),
          bloomLevel: String(row.bloomLevel ?? 'UNDERSTAND'),
          hours: Number(row.hours ?? 0),
          status: String(row.status ?? 'UPCOMING'),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return Promise.resolve({ count: data.length });
    }),
  };

  return {
    default: {
      course: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; organizationId: string } }) => {
          if (where.id === courseId && where.organizationId === orgId) {
            return Promise.resolve({ id: courseId, organizationId: orgId });
          }
          return Promise.resolve(null);
        }),
      },
      courseSyllabusUnit,
      $transaction: vi.fn().mockImplementation(async (fn: (tx: { courseSyllabusUnit: typeof courseSyllabusUnit }) => Promise<unknown>) =>
        fn({ courseSyllabusUnit }),
      ),
    },
  };
});

const COURSE_ID = '11111111-1111-1111-1111-111111111111';
const ORG_ID = '22222222-2222-2222-2222-222222222222';

describe('SyllabusUnitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listUnits', () => {
    it('returns units ordered by unit number when course exists in org', async () => {
      await SyllabusUnitService.replaceUnits(COURSE_ID, ORG_ID, [
        { unitNumber: 2, title: 'Unit Two', topics: ['B'] },
        { unitNumber: 1, title: 'Unit One', topics: ['A'] },
      ]);

      const units = await SyllabusUnitService.listUnits(COURSE_ID, ORG_ID);

      expect(units).toHaveLength(2);
      expect(units[0].unitNumber).toBe(1);
      expect(units[0].title).toBe('Unit One');
      expect(units[1].unitNumber).toBe(2);
    });

    it('throws when course is not in organization', async () => {
      await expect(
        SyllabusUnitService.listUnits(COURSE_ID, '99999999-9999-9999-9999-999999999999'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('replaceUnits', () => {
    it('replaces all units for course+org in a transaction', async () => {
      const first = await SyllabusUnitService.replaceUnits(COURSE_ID, ORG_ID, [
        { unitNumber: 1, title: 'Intro', topics: ['Overview'], coMapped: 'CO1', hours: 4 },
      ]);
      expect(first).toHaveLength(1);
      expect(first[0].title).toBe('Intro');
      expect(first[0].coMapped).toBe('CO1');

      const second = await SyllabusUnitService.replaceUnits(COURSE_ID, ORG_ID, [
        { unitNumber: 1, title: 'Revised Intro', topics: ['New topic'], bloomLevel: 'APPLY', status: 'IN_PROGRESS' },
        { unitNumber: 2, title: 'Advanced', topics: [] },
      ]);

      expect(second).toHaveLength(2);
      expect(second[0].title).toBe('Revised Intro');
      expect(second[0].bloomLevel).toBe('APPLY');
      expect(second[0].status).toBe('IN_PROGRESS');
      expect(second[1].unitNumber).toBe(2);
    });

    it('allows clearing all units with an empty array', async () => {
      await SyllabusUnitService.replaceUnits(COURSE_ID, ORG_ID, [
        { unitNumber: 1, title: 'Temp', topics: [] },
      ]);
      const cleared = await SyllabusUnitService.replaceUnits(COURSE_ID, ORG_ID, []);
      expect(cleared).toHaveLength(0);
    });
  });
});
