import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttainmentService } from '../services/obe/attainment.service';
import prisma from '../config/prisma';

const COURSE_ID = 'course-123';
const ORG_ID = 'org-123';

const mockCourse = {
  id: COURSE_ID,
  name: 'Operating Systems',
  code: 'CS301',
  organizationId: ORG_ID,
};

const mockOutcomes = [
  {
    id: 'co-1',
    code: 'CO1',
    description: 'Understand OS fundamentals',
    bloomLevel: 'UNDERSTAND',
    courseId: COURSE_ID,
    organizationId: ORG_ID,
  },
  {
    id: 'co-2',
    code: 'CO2',
    description: 'Analyze scheduling algorithms',
    bloomLevel: 'ANALYZE',
    courseId: COURSE_ID,
    organizationId: ORG_ID,
  },
];

const ASSIGNMENT_ID = 'assign-1';

const mockGradedSubmissions = [
  {
    assignmentId: ASSIGNMENT_ID,
    organizationId: ORG_ID,
    status: 'GRADED',
    evaluations: [{ score: 80, totalMarks: 100 }],
  },
];

vi.mock('../config/prisma', () => ({
  default: {
    course: {
      findFirst: vi.fn(),
    },
    courseOutcome: {
      findMany: vi.fn(),
    },
    blueprintItem: {
      findMany: vi.fn(),
    },
    assignment: {
      findMany: vi.fn(),
    },
    generatedPaper: {
      findMany: vi.fn(),
    },
    studentSubmission: {
      findMany: vi.fn(),
    },
  },
}));

describe('AttainmentService.calculateCoAttainment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.course.findFirst).mockResolvedValue(mockCourse as never);
    vi.mocked(prisma.courseOutcome.findMany).mockResolvedValue(mockOutcomes as never);
    vi.mocked(prisma.assignment.findMany).mockResolvedValue([
      { id: ASSIGNMENT_ID, subject: 'CS301' },
    ] as never);
    vi.mocked(prisma.studentSubmission.findMany).mockResolvedValue(mockGradedSubmissions as never);
  });

  it('does not assign identical attainment when only one CO has mapped paper evidence', async () => {
    vi.mocked(prisma.blueprintItem.findMany).mockResolvedValue([]);
    vi.mocked(prisma.generatedPaper.findMany).mockResolvedValue([
      {
        assignmentId: ASSIGNMENT_ID,
        sections: [
          {
            title: 'Section A',
            questions: [
              { text: 'Explain paging', coId: 'co-1', marks: 100 },
            ],
          },
        ],
      },
    ] as never);

    const result = await AttainmentService.calculateCoAttainment(COURSE_ID, ORG_ID);

    const co1 = result.outcomes.find((o) => o.coId === 'co-1');
    const co2 = result.outcomes.find((o) => o.coId === 'co-2');

    expect(co1?.dataStatus).toBe('COMPLETE');
    expect(co1?.evidenceCount).toBe(1);
    expect(co1?.directAttainment).toBe(0.8);
    expect(co1?.attainment).toBe(0.64);
    expect(co1?.indirectAttainment).toBe(0);

    expect(co2?.dataStatus).toBe('INCOMPLETE');
    expect(co2?.evidenceCount).toBe(0);
    expect(co2?.attainment).toBe(0);
    expect(co2?.attainment).not.toBe(co1?.attainment);
  });

  it('returns incomplete outcomes when no mapped evidence exists', async () => {
    vi.mocked(prisma.blueprintItem.findMany).mockResolvedValue([]);
    vi.mocked(prisma.generatedPaper.findMany).mockResolvedValue([
      {
        assignmentId: ASSIGNMENT_ID,
        sections: [{ title: 'Section A', questions: [{ text: 'Untagged', marks: 100 }] }],
      },
    ] as never);

    const result = await AttainmentService.calculateCoAttainment(COURSE_ID, ORG_ID);

    for (const outcome of result.outcomes) {
      expect(outcome.dataStatus).toBe('INCOMPLETE');
      expect(outcome.evidenceCount).toBe(0);
      expect(outcome.attainment).toBe(0);
    }
  });
});