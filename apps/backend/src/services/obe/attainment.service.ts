import prisma from '../../config/prisma';
import { ApiError } from '../../api/common/errors';

export interface FormulaConfig {
  directWeight: number;
  indirectWeight: number;
}

const DEFAULT_FORMULA: FormulaConfig = {
  directWeight: 0.8,
  indirectWeight: 0.2,
};

type GradedSubmission = {
  assignmentId: string;
  evaluations: Array<{ score: number; totalMarks: number }>;
};

type CourseOutcomeRow = {
  id: string;
  code: string;
  description: string;
  bloomLevel: string;
};

type CoEvidenceProfile = {
  blueprintMarks: number;
  paperMarksByAssignment: Map<string, number>;
};

function resolveCoId(
  ref: string,
  outcomes: Array<{ id: string; code: string }>
): string | null {
  const byId = outcomes.find((o) => o.id === ref);
  if (byId) return byId.id;
  const byCode = outcomes.find((o) => o.code === ref || o.code.toUpperCase() === ref.toUpperCase());
  return byCode?.id ?? null;
}

function extractCoMarksFromPaperSections(
  sections: unknown,
  outcomes: Array<{ id: string; code: string }>
): Map<string, number> {
  const marksByCo = new Map<string, number>();
  if (!Array.isArray(sections)) return marksByCo;

  for (const section of sections) {
    if (!section || typeof section !== 'object') continue;
    const questions = (section as { questions?: unknown }).questions;
    if (!Array.isArray(questions)) continue;

    for (const question of questions) {
      if (!question || typeof question !== 'object') continue;
      const q = question as { coId?: unknown; marks?: unknown };
      if (typeof q.coId !== 'string') continue;
      const coId = resolveCoId(q.coId, outcomes);
      if (!coId) continue;
      const marks = typeof q.marks === 'number' && q.marks > 0 ? q.marks : 0;
      marksByCo.set(coId, (marksByCo.get(coId) ?? 0) + marks);
    }
  }

  return marksByCo;
}

function coMarksOnAssignment(profile: CoEvidenceProfile, assignmentId: string): number {
  return profile.paperMarksByAssignment.get(assignmentId) ?? 0;
}

function hasMappedEvidence(profile: CoEvidenceProfile): boolean {
  if (profile.blueprintMarks > 0) return true;
  for (const marks of profile.paperMarksByAssignment.values()) {
    if (marks > 0) return true;
  }
  return false;
}

export class AttainmentService {
  static async calculateCoAttainment(
    courseId: string,
    organizationId: string,
    threshold = 0.6,
    formula: FormulaConfig = DEFAULT_FORMULA
  ) {
    const course = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
    });
    if (!course) throw ApiError.notFound('Course not found');

    const outcomes = await prisma.courseOutcome.findMany({
      where: { courseId, organizationId },
    });

    const evidence = await this.loadCourseEvidence(
      courseId,
      organizationId,
      outcomes,
      course.code,
      course.name
    );

    const results = [];

    for (const co of outcomes) {
      const profile = evidence.profiles.get(co.id);
      const mapped = profile && hasMappedEvidence(profile);

      if (!mapped || !profile) {
        results.push({
          coId: co.id,
          coCode: co.code,
          description: co.description,
          bloomLevel: co.bloomLevel,
          attainment: 0,
          directAttainment: null as number | null,
          indirectAttainment: 0,
          threshold,
          metThreshold: false,
          dataStatus: 'INCOMPLETE' as const,
          evidenceCount: 0,
          indirectDataStatus: 'INCOMPLETE' as const,
        });
        continue;
      }

      const { directAttainment, evidenceCount } = this.computeDirectCoAttainment(
        evidence.gradedSubs,
        co.id,
        evidence.profiles,
        evidence.anyPaperCoTags
      );

      const indirectAttainment = 0;
      const attainment = parseFloat(
        Math.min(
          1,
          Math.max(0, formula.directWeight * directAttainment + formula.indirectWeight * indirectAttainment)
        ).toFixed(2)
      );

      results.push({
        coId: co.id,
        coCode: co.code,
        description: co.description,
        bloomLevel: co.bloomLevel,
        attainment,
        directAttainment: parseFloat(directAttainment.toFixed(2)),
        indirectAttainment,
        threshold,
        metThreshold: attainment >= threshold,
        dataStatus: evidenceCount > 0 ? ('COMPLETE' as const) : ('INCOMPLETE' as const),
        evidenceCount,
        indirectDataStatus: 'INCOMPLETE' as const,
      });
    }

    const measurable = results.filter((r) => r.dataStatus === 'COMPLETE');
    const overall =
      measurable.length > 0
        ? measurable.reduce((sum, r) => sum + r.attainment, 0) / measurable.length
        : 0;

    return {
      courseId,
      courseName: course.name,
      threshold,
      formula,
      outcomes: results,
      overallAttainment: parseFloat(overall.toFixed(2)),
      flaggedCos: results.filter((r) => !r.metThreshold),
    };
  }

  static async calculatePoAttainment(
    organizationId: string,
    threshold = 0.6,
    formula: FormulaConfig = DEFAULT_FORMULA
  ) {
    const programOutcomes = await prisma.programOutcome.findMany({
      where: { organizationId },
      include: {
        poMappings: {
          include: {
            co: { select: { id: true, courseId: true } },
          },
        },
      },
    });

    const courseIds = [
      ...new Set(
        programOutcomes.flatMap((po) => po.poMappings.map((m) => m.co.courseId))
      ),
    ];

    const coScores = new Map<string, number>();
    for (const courseId of courseIds) {
      const coResult = await this.calculateCoAttainment(courseId, organizationId, threshold, formula);
      for (const outcome of coResult.outcomes) {
        coScores.set(outcome.coId, outcome.attainment);
      }
    }

    const results = [];

    for (const po of programOutcomes) {
      if (po.poMappings.length === 0) {
        results.push({
          poId: po.id,
          poCode: po.code,
          description: po.description,
          attainment: 0,
          threshold,
          metThreshold: false,
          contributingCOs: 0,
        });
        continue;
      }

      let totalWeight = 0;
      let weightedSum = 0;

      for (const mapping of po.poMappings) {
        const coAttainment = coScores.get(mapping.coId) ?? 0;
        weightedSum += coAttainment * mapping.weightage;
        totalWeight += mapping.weightage;
      }

      const attainment = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const rounded = parseFloat(attainment.toFixed(2));

      results.push({
        poId: po.id,
        poCode: po.code,
        description: po.description,
        attainment: rounded,
        threshold,
        metThreshold: rounded >= threshold,
        contributingCOs: po.poMappings.length,
      });
    }

    const overall =
      results.length > 0 ? results.reduce((sum, r) => sum + r.attainment, 0) / results.length : 0;

    return {
      threshold,
      formula,
      programOutcomes: results,
      overallAttainment: parseFloat(overall.toFixed(2)),
      flaggedPos: results.filter((r) => !r.metThreshold),
    };
  }

  static async getAttainmentDashboard(courseId: string, organizationId: string) {
    const coAttainment = await this.calculateCoAttainment(courseId, organizationId);
    const poAttainment = await this.calculatePoAttainment(organizationId);

    return {
      course: coAttainment,
      program: poAttainment,
      summary: {
        totalCOs: coAttainment.outcomes.length,
        cosMeetingTarget: coAttainment.outcomes.filter((o) => o.metThreshold).length,
        totalPOs: poAttainment.programOutcomes.length,
        posMeetingTarget: poAttainment.programOutcomes.filter((o) => o.metThreshold).length,
      },
    };
  }

  static async getFlaggedCos(courseId: string, organizationId: string, threshold = 0.6) {
    const result = await this.calculateCoAttainment(courseId, organizationId, threshold);
    return result.flaggedCos;
  }

  private static async loadCourseEvidence(
    courseId: string,
    organizationId: string,
    outcomes: CourseOutcomeRow[],
    courseCode: string,
    courseName: string
  ) {
    const outcomeKeys = outcomes.map((o) => ({ id: o.id, code: o.code }));

    const blueprintItems = await prisma.blueprintItem.findMany({
      where: {
        co: { courseId, organizationId },
      },
      select: { coId: true, marks: true, count: true },
    });

    const profiles = new Map<string, CoEvidenceProfile>();
    let anyPaperCoTags = false;
    for (const co of outcomes) {
      profiles.set(co.id, { blueprintMarks: 0, paperMarksByAssignment: new Map() });
    }

    for (const item of blueprintItems) {
      const profile = profiles.get(item.coId);
      if (!profile) continue;
      profile.blueprintMarks += item.marks * Math.max(1, item.count);
    }

    const subjectMatchers = [courseCode, courseName]
      .map((s) => s?.trim().toLowerCase())
      .filter(Boolean);

    const assignments = await prisma.assignment.findMany({
      where: { organizationId },
      select: { id: true, subject: true },
    });

    const courseAssignmentIds = assignments
      .filter((a) => subjectMatchers.includes(a.subject.trim().toLowerCase()))
      .map((a) => a.id);

    if (courseAssignmentIds.length > 0) {
      const papers = await prisma.generatedPaper.findMany({
        where: {
          organizationId,
          assignmentId: { in: courseAssignmentIds },
        },
        select: { assignmentId: true, sections: true },
      });

      for (const paper of papers) {
        const coMarks = extractCoMarksFromPaperSections(paper.sections, outcomeKeys);
        if (coMarks.size > 0) anyPaperCoTags = true;
        for (const [coId, marks] of coMarks.entries()) {
          const profile = profiles.get(coId);
          if (!profile || marks <= 0) continue;
          const current = profile.paperMarksByAssignment.get(paper.assignmentId) ?? 0;
          profile.paperMarksByAssignment.set(paper.assignmentId, current + marks);
        }
      }
    }

    const submissions =
      courseAssignmentIds.length > 0
        ? await prisma.studentSubmission.findMany({
            where: {
              assignmentId: { in: courseAssignmentIds },
              organizationId,
              status: 'GRADED',
            },
            include: {
              evaluations: { select: { score: true, totalMarks: true } },
            },
          })
        : [];

    const gradedSubs: GradedSubmission[] = submissions.filter(
      (s) => s.evaluations.length > 0 && s.evaluations[0].totalMarks > 0
    );

    return { profiles, gradedSubs, courseAssignmentIds, anyPaperCoTags };
  }

  private static computeDirectCoAttainment(
    gradedSubs: GradedSubmission[],
    coId: string,
    profiles: Map<string, CoEvidenceProfile>,
    anyPaperCoTags: boolean
  ): { directAttainment: number; evidenceCount: number } {
    const profile = profiles.get(coId);
    if (!profile) return { directAttainment: 0, evidenceCount: 0 };

    const ratios: number[] = [];

    for (const sub of gradedSubs) {
      const coMarks = coMarksOnAssignment(profile, sub.assignmentId);
      const countsViaBlueprintOnly =
        !anyPaperCoTags && coMarks <= 0 && profile.blueprintMarks > 0;

      if (coMarks <= 0 && !countsViaBlueprintOnly) continue;

      if (coMarks <= 0 && countsViaBlueprintOnly) {
        const ev = sub.evaluations[0];
        ratios.push(ev.score / ev.totalMarks);
        continue;
      }

      if (coMarks <= 0) continue;

      const ev = sub.evaluations[0];
      const obtained = ev.score * (coMarks / ev.totalMarks);
      const directRatio = obtained / coMarks;
      ratios.push(directRatio);
    }

    if (ratios.length === 0) {
      return { directAttainment: 0, evidenceCount: 0 };
    }

    const directAttainment = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    return { directAttainment, evidenceCount: ratios.length };
  }
}