import { describe, it, expect } from 'vitest';
import { BlueprintValidationService } from '../services/obe/blueprint-validation.service';
import { BlueprintService } from '../services/obe/blueprint.service';

describe('BlueprintValidationService.validateBlueprintItems', () => {
  it('passes when item marks match total', () => {
    const result = BlueprintValidationService.validateBlueprintItems({
      totalMarks: 100,
      items: [
        { coId: 'co-1', bloomLevel: 'UNDERSTAND', marks: 10, count: 5 },
        { coId: 'co-2', bloomLevel: 'APPLY', marks: 25, count: 2 },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.totalItemMarks).toBe(100);
    expect(result.coCoverage).toBe(2);
  });

  it('fails closed on total marks mismatch', () => {
    const result = BlueprintValidationService.validateBlueprintItems({
      totalMarks: 100,
      items: [{ coId: 'co-1', bloomLevel: 'REMEMBER', marks: 10, count: 5 }],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'TOTAL_MARKS_MISMATCH')).toBe(true);
  });

  it('fails closed when there are no items', () => {
    const result = BlueprintValidationService.validateBlueprintItems({
      totalMarks: 50,
      items: [],
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.type).toBe('NO_ITEMS');
  });
});

describe('BlueprintValidationService.validateExamPaperBlueprint', () => {
  const validMidSemSections = [
    {
      sectionName: 'Part A',
      totalSectionMarks: 10,
      questions: [
        { questionText: 'Explain process scheduling basics', coId: 'CO1', bloomLevel: 'UNDERSTAND', marks: 2 },
        { questionText: 'Define kernel mode execution', coId: 'CO1', bloomLevel: 'UNDERSTAND', marks: 2 },
        { questionText: 'State mutex applications', coId: 'CO2', bloomLevel: 'REMEMBER', marks: 2 },
        { questionText: 'Describe deadlock conditions', coId: 'CO2', bloomLevel: 'UNDERSTAND', marks: 2 },
        { questionText: 'Define virtual memory paging', coId: 'CO3', bloomLevel: 'REMEMBER', marks: 2 },
      ],
    },
    {
      sectionName: 'Part B',
      totalSectionMarks: 20,
      questions: [
        {
          questionText: 'Demonstrate Round-Robin scheduling for five processes',
          coId: 'CO2',
          bloomLevel: 'APPLY',
          marks: 10,
        },
        {
          questionText: 'Analyze Banker Algorithm safe-state detection',
          coId: 'CO3',
          bloomLevel: 'ANALYZE',
          marks: 10,
        },
      ],
    },
    {
      sectionName: 'Part C',
      totalSectionMarks: 20,
      questions: [
        {
          questionText: 'Formulate producer-consumer synchronization with semaphores',
          coId: 'CO5',
          bloomLevel: 'EVALUATE',
          marks: 20,
        },
      ],
    },
  ];

  it('passes a consistent 50-mark mid-sem paper without declared distributions', () => {
    const result = BlueprintValidationService.validateExamPaperBlueprint({
      totalMarks: 50,
      difficulty: 'MODERATE',
      sections: validMidSemSections,
    });
    expect(result.valid).toBe(true);
    expect(result.totalItemMarks).toBe(50);
    expect(result.actualCoMarksDistribution.CO1).toBe(8);
    expect(result.actualBloomBands.applyAnalyze).toBe(40);
  });

  it('rejects fabricated CO mark distribution (generated controller defaults)', () => {
    const result = BlueprintValidationService.validateExamPaperBlueprint({
      totalMarks: 50,
      sections: validMidSemSections,
      coMarksDistribution: { CO1: 20, CO2: 20, CO3: 20, CO4: 20, CO5: 20 },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'CO_DISTRIBUTION_MISMATCH')).toBe(true);
  });

  it('rejects fabricated Bloom band distribution', () => {
    const result = BlueprintValidationService.validateExamPaperBlueprint({
      totalMarks: 50,
      sections: validMidSemSections,
      bloomDistribution: { rememberUnderstand: 20, applyAnalyze: 45, evaluateCreate: 35 },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'BLOOM_DISTRIBUTION_MISMATCH')).toBe(true);
  });

  it('fails when section declared marks do not match question sum', () => {
    const result = BlueprintValidationService.validateExamPaperBlueprint({
      totalMarks: 50,
      sections: [
        {
          sectionName: 'Part B',
          totalSectionMarks: 20,
          questions: [
            { coId: 'CO2', bloomLevel: 'APPLY', marks: 10 },
            { coId: 'CO3', bloomLevel: 'ANALYZE', marks: 10 },
            { coId: 'CO4', bloomLevel: 'APPLY', marks: 10 },
          ],
        },
        {
          sectionName: 'Part C',
          totalSectionMarks: 30,
          questions: [{ coId: 'CO5', bloomLevel: 'EVALUATE', marks: 20 }],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'SECTION_MARKS_MISMATCH')).toBe(true);
  });

  it('fails when a syllabus unit CO has no question marks', () => {
    const result = BlueprintValidationService.validateExamPaperBlueprint({
      totalMarks: 50,
      sections: validMidSemSections,
      units: [
        {
          unitNumber: 4,
          title: 'Unit 4: File Systems',
          topics: ['inodes', 'allocation methods'],
          coMapped: 'CO4',
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'UNIT_CO_NOT_COVERED')).toBe(true);
  });

  it('computes actual distributions consumers can trust', () => {
    const result = BlueprintValidationService.validateExamPaperBlueprint({
      totalMarks: 50,
      sections: validMidSemSections,
    });
    const declaredSum =
      (result.actualCoMarksDistribution.CO1 ?? 0) +
      (result.actualCoMarksDistribution.CO2 ?? 0) +
      (result.actualCoMarksDistribution.CO3 ?? 0) +
      (result.actualCoMarksDistribution.CO5 ?? 0);
    expect(declaredSum).toBeGreaterThanOrEqual(98);
    expect(
      result.actualBloomBands.rememberUnderstand +
        result.actualBloomBands.applyAnalyze +
        result.actualBloomBands.evaluateCreate
    ).toBeGreaterThanOrEqual(98);
  });
});

describe('BlueprintService.validateBlueprint delegation', () => {
  it('delegates to BlueprintValidationService', () => {
    const viaService = BlueprintValidationService.validateBlueprintItems({
      totalMarks: 20,
      items: [{ coId: 'co-a', bloomLevel: 'APPLY', marks: 5, count: 4 }],
    });
    const viaBlueprint = BlueprintService.validateBlueprint({
      totalMarks: 20,
      items: [{ coId: 'co-a', bloomLevel: 'APPLY', marks: 5, count: 4 }],
    });
    expect(viaBlueprint).toEqual(viaService);
  });
});