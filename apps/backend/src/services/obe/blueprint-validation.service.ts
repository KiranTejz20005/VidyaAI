export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  type: string;
  message: string;
  severity: ValidationSeverity;
  required?: number | string;
  actual?: number | string;
}

export interface BlueprintItemsInput {
  totalMarks: number;
  items: Array<{
    marks: number;
    count: number;
    coId: string;
    bloomLevel: string;
    topic?: string | null;
  }>;
}

export interface ExamPaperQuestion {
  questionText?: string;
  coId: string;
  bloomLevel: string;
  marks: number;
}

export interface ExamPaperSection {
  sectionName?: string;
  totalSectionMarks: number;
  questions: ExamPaperQuestion[];
}

export interface SyllabusUnitRef {
  unitNumber: number;
  title: string;
  topics?: string[];
  coMapped: string;
}

export interface ExamPaperBlueprintInput {
  totalMarks: number;
  difficulty?: string;
  sections: ExamPaperSection[];
  bloomDistribution?: {
    rememberUnderstand: number;
    applyAnalyze: number;
    evaluateCreate: number;
  };
  coMarksDistribution?: Record<string, number>;
  units?: SyllabusUnitRef[];
  /** CO codes that must receive marks when declared (e.g. CO1–CO6). */
  requiredCoCodes?: string[];
}

export interface BlueprintValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  totalItemMarks: number;
  coCoverage: number;
  bloomDistribution: Record<string, number>;
  actualBloomBands: { rememberUnderstand: number; applyAnalyze: number; evaluateCreate: number };
  actualCoMarksDistribution: Record<string, number>;
  unitsCovered: number;
}

const REMEMBER_UNDERSTAND = new Set(['REMEMBER', 'UNDERSTAND']);
const APPLY_ANALYZE = new Set(['APPLY', 'ANALYZE']);
const EVALUATE_CREATE = new Set(['EVALUATE', 'CREATE']);

const DISTRIBUTION_TOLERANCE_PCT = 1;

function pctOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function pushDistributionMismatch(
  issues: ValidationIssue[],
  kind: 'CO' | 'BTL',
  key: string,
  required: number,
  actual: number
) {
  if (Math.abs(required - actual) <= DISTRIBUTION_TOLERANCE_PCT) return;
  issues.push({
    type: kind === 'CO' ? 'CO_DISTRIBUTION_MISMATCH' : 'BLOOM_DISTRIBUTION_MISMATCH',
    message:
      kind === 'CO'
        ? `${key}: declared ${required}% of marks but actual is ${actual}%`
        : `${key} band: declared ${required}% of marks but actual is ${actual}%`,
    severity: 'error',
    required,
    actual,
  });
}

function collectExamQuestions(sections: ExamPaperSection[]): ExamPaperQuestion[] {
  return sections.flatMap((s) => s.questions ?? []);
}

function computeBloomBands(
  questions: Array<{ bloomLevel: string; marks: number }>,
  totalMarks: number
): { rememberUnderstand: number; applyAnalyze: number; evaluateCreate: number } {
  let ru = 0;
  let aa = 0;
  let ec = 0;
  for (const q of questions) {
    const level = q.bloomLevel.toUpperCase();
    if (REMEMBER_UNDERSTAND.has(level)) ru += q.marks;
    else if (APPLY_ANALYZE.has(level)) aa += q.marks;
    else if (EVALUATE_CREATE.has(level)) ec += q.marks;
  }
  return {
    rememberUnderstand: pctOf(ru, totalMarks),
    applyAnalyze: pctOf(aa, totalMarks),
    evaluateCreate: pctOf(ec, totalMarks),
  };
}

function computeCoMarksDistribution(
  questions: Array<{ coId: string; marks: number }>,
  totalMarks: number
): Record<string, number> {
  const byCo = new Map<string, number>();
  for (const q of questions) {
    byCo.set(q.coId, (byCo.get(q.coId) ?? 0) + q.marks);
  }
  const out: Record<string, number> = {};
  for (const [coId, marks] of byCo) {
    out[coId] = pctOf(marks, totalMarks);
  }
  return out;
}

function computePerBloomMarks(
  questions: Array<{ bloomLevel: string; marks: number }>
): Record<string, number> {
  const map = new Map<string, number>();
  for (const q of questions) {
    const level = q.bloomLevel.toUpperCase();
    map.set(level, (map.get(level) ?? 0) + q.marks);
  }
  return Object.fromEntries(map);
}

function unitReferencedInQuestions(unit: SyllabusUnitRef, questions: ExamPaperQuestion[]): boolean {
  const titleCore = unit.title.replace(/^Unit\s+\d+:\s*/i, '').trim().toLowerCase();
  const needles = [titleCore, ...(unit.topics ?? []).map((t) => t.trim().toLowerCase())].filter(
    (n) => n.length >= 4
  );
  if (needles.length === 0) return false;
  return questions.some((q) => {
    const text = (q.questionText ?? '').toLowerCase();
    return needles.some((n) => text.includes(n));
  });
}

export class BlueprintValidationService {
  static validateBlueprintItems(blueprint: BlueprintItemsInput): BlueprintValidationResult {
    const issues: ValidationIssue[] = [];

    if (!blueprint.items.length) {
      issues.push({
        type: 'NO_ITEMS',
        message: 'Blueprint has no items',
        severity: 'error',
      });
      return {
        valid: false,
        issues,
        totalItemMarks: 0,
        coCoverage: 0,
        bloomDistribution: {},
        actualBloomBands: { rememberUnderstand: 0, applyAnalyze: 0, evaluateCreate: 0 },
        actualCoMarksDistribution: {},
        unitsCovered: 0,
      };
    }

    const expanded = blueprint.items.flatMap((item) =>
      Array.from({ length: Math.max(1, item.count) }, () => ({
        coId: item.coId,
        bloomLevel: item.bloomLevel,
        marks: item.marks,
      }))
    );

    const totalItemMarks = expanded.reduce((sum, row) => sum + row.marks, 0);
    const totalMarks = blueprint.totalMarks;

    if (totalItemMarks !== totalMarks) {
      issues.push({
        type: 'TOTAL_MARKS_MISMATCH',
        message: `Item marks total (${totalItemMarks}) does not match blueprint total (${totalMarks})`,
        severity: 'error',
        required: totalMarks,
        actual: totalItemMarks,
      });
    }

    const coMarksMap = new Map<string, number>();
    const bloomMap = new Map<string, number>();

    for (const row of expanded) {
      coMarksMap.set(row.coId, (coMarksMap.get(row.coId) ?? 0) + row.marks);
      const level = row.bloomLevel.toUpperCase();
      bloomMap.set(level, (bloomMap.get(level) ?? 0) + row.marks);
    }

    const actualCoMarksDistribution = computeCoMarksDistribution(expanded, totalMarks || totalItemMarks || 1);
    const actualBloomBands = computeBloomBands(expanded, totalMarks || totalItemMarks || 1);

    const maxCoMarks = Math.max(...Array.from(coMarksMap.values()));
    const coMarksRatio = maxCoMarks / (totalMarks || totalItemMarks || 1);
    if (coMarksRatio > 0.4) {
      issues.push({
        type: 'CO_CONCENTRATION',
        message: `A single CO accounts for ${Math.round(coMarksRatio * 100)}% of total marks (max 40%)`,
        severity: 'warning',
      });
    }

    if (bloomMap.size === 1 && expanded.length > 1) {
      issues.push({
        type: 'SINGLE_BLOOM',
        message: 'All items target the same Bloom level — consider diversifying',
        severity: 'warning',
      });
    }

    const valid = !issues.some((i) => i.severity === 'error');

    return {
      valid,
      issues,
      totalItemMarks,
      coCoverage: coMarksMap.size,
      bloomDistribution: Object.fromEntries(bloomMap),
      actualBloomBands,
      actualCoMarksDistribution,
      unitsCovered: 0,
    };
  }

  static validateExamPaperBlueprint(blueprint: ExamPaperBlueprintInput): BlueprintValidationResult {
    const issues: ValidationIssue[] = [];
    const questions = collectExamQuestions(blueprint.sections);

    if (questions.length === 0) {
      issues.push({
        type: 'NO_ITEMS',
        message: 'Blueprint has no questions',
        severity: 'error',
      });
      return {
        valid: false,
        issues,
        totalItemMarks: 0,
        coCoverage: 0,
        bloomDistribution: {},
        actualBloomBands: { rememberUnderstand: 0, applyAnalyze: 0, evaluateCreate: 0 },
        actualCoMarksDistribution: {},
        unitsCovered: 0,
      };
    }

    const totalItemMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const totalMarks = blueprint.totalMarks;

    if (totalItemMarks !== totalMarks) {
      issues.push({
        type: 'TOTAL_MARKS_MISMATCH',
        message: `Question marks (${totalItemMarks}) do not match blueprint total (${totalMarks})`,
        severity: 'error',
        required: totalMarks,
        actual: totalItemMarks,
      });
    }

    for (const section of blueprint.sections) {
      const sectionSum = (section.questions ?? []).reduce((s, q) => s + q.marks, 0);
      if (sectionSum !== section.totalSectionMarks) {
        issues.push({
          type: 'SECTION_MARKS_MISMATCH',
          message: `Section "${section.sectionName ?? 'unnamed'}" declares ${section.totalSectionMarks} marks but questions sum to ${sectionSum}`,
          severity: 'error',
          required: section.totalSectionMarks,
          actual: sectionSum,
        });
      }
    }

    const denominator = totalMarks > 0 ? totalMarks : totalItemMarks;
    const actualCoMarksDistribution = computeCoMarksDistribution(questions, denominator);
    const actualBloomBands = computeBloomBands(questions, denominator);
    const bloomDistribution = computePerBloomMarks(questions);

    const coCoverage = new Set(questions.map((q) => q.coId)).size;

    if (blueprint.coMarksDistribution) {
      for (const [coId, declaredPct] of Object.entries(blueprint.coMarksDistribution)) {
        const actualPct = actualCoMarksDistribution[coId] ?? 0;
        pushDistributionMismatch(issues, 'CO', coId, declaredPct, actualPct);
      }
      for (const coId of Object.keys(actualCoMarksDistribution)) {
        if (!(coId in blueprint.coMarksDistribution)) {
          issues.push({
            type: 'CO_DISTRIBUTION_MISMATCH',
            message: `${coId} has ${actualCoMarksDistribution[coId]}% of marks but is missing from declared CO distribution`,
            severity: 'error',
            actual: actualCoMarksDistribution[coId],
          });
        }
      }
    }

    if (blueprint.bloomDistribution) {
      const bands: Array<[keyof typeof blueprint.bloomDistribution, string]> = [
        ['rememberUnderstand', 'Remember/Understand'],
        ['applyAnalyze', 'Apply/Analyze'],
        ['evaluateCreate', 'Evaluate/Create'],
      ];
      for (const [key, label] of bands) {
        const declared = blueprint.bloomDistribution[key];
        const actual = actualBloomBands[key];
        pushDistributionMismatch(issues, 'BTL', label, declared, actual);
      }
    }

    if (blueprint.requiredCoCodes?.length) {
      for (const coCode of blueprint.requiredCoCodes) {
        if (!(coCode in actualCoMarksDistribution) || actualCoMarksDistribution[coCode] === 0) {
          issues.push({
            type: 'REQUIRED_CO_MISSING',
            message: `Required ${coCode} has no marks in the blueprint`,
            severity: 'error',
            required: coCode,
          });
        }
      }
    }

    let unitsCovered = 0;
    if (blueprint.units?.length) {
      for (const unit of blueprint.units) {
        const coMarks = questions
          .filter((q) => q.coId === unit.coMapped)
          .reduce((s, q) => s + q.marks, 0);
        const referenced = unitReferencedInQuestions(unit, questions);
        if (coMarks <= 0) {
          issues.push({
            type: 'UNIT_CO_NOT_COVERED',
            message: `Unit ${unit.unitNumber} (${unit.title}) maps to ${unit.coMapped} but no questions carry that CO`,
            severity: 'error',
            required: unit.coMapped,
            actual: 0,
          });
        } else if (!referenced) {
          issues.push({
            type: 'UNIT_NOT_REFERENCED',
            message: `Unit ${unit.unitNumber} (${unit.title}) is not reflected in any question text`,
            severity: 'warning',
          });
        } else {
          unitsCovered += 1;
        }
      }
    }

    if (blueprint.difficulty) {
      const d = blueprint.difficulty.toUpperCase();
      if (d === 'EASY' && actualBloomBands.evaluateCreate > 25) {
        issues.push({
          type: 'DIFFICULTY_BTL_MISMATCH',
          message: `Difficulty is EASY but Evaluate/Create band is ${actualBloomBands.evaluateCreate}% (expected lower weight)`,
          severity: 'error',
          required: '≤25%',
          actual: `${actualBloomBands.evaluateCreate}%`,
        });
      } else if (d === 'CHALLENGING' && actualBloomBands.rememberUnderstand > 40) {
        issues.push({
          type: 'DIFFICULTY_BTL_MISMATCH',
          message: `Difficulty is CHALLENGING but Remember/Understand band is ${actualBloomBands.rememberUnderstand}% (expected lower weight)`,
          severity: 'error',
          required: '≤40%',
          actual: `${actualBloomBands.rememberUnderstand}%`,
        });
      }
    }

    const valid = !issues.some((i) => i.severity === 'error');

    return {
      valid,
      issues,
      totalItemMarks,
      coCoverage,
      bloomDistribution,
      actualBloomBands,
      actualCoMarksDistribution,
      unitsCovered,
    };
  }
}