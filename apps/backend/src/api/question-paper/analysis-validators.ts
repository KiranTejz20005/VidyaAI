import { z } from 'zod';

/** Teacher-facing correction payload (PATCH). */
export const patchAnalysisQuestionsSchema = z.object({
  params: z.object({
    jobId: z.string().uuid(),
  }),
  body: z.object({
    questions: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          number: z.string().min(1).optional(),
          subquestion: z.string().optional(),
          text: z.string().min(1).optional(),
          marks: z.number().positive().max(500).optional(),
          courseOutcomeId: z.string().uuid().optional(),
          courseOutcomeCode: z.string().max(32).optional(),
          bloomLevel: z.string().max(64).optional(),
          difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
          unit: z.string().max(256).optional(),
          topic: z.string().max(256).optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
});

export const analyzeJobIdParamSchema = z.object({
  params: z.object({
    jobId: z.string().uuid(),
  }),
});

export const analyzeQuestionPaperBodySchema = z.object({
  body: z.object({
    storageKey: z.string().min(1).optional(),
    filename: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    preferHandwriting: z
      .union([z.boolean(), z.literal('true'), z.literal('false')])
      .optional()
      .transform((v) => v === true || v === 'true'),
    useAiEnrichment: z
      .union([z.boolean(), z.literal('true'), z.literal('false')])
      .optional()
      .transform((v) => v !== false && v !== 'false'),
  }),
});

/** Optional AI structured extraction — validated before merge; malformed output is rejected. */
export const aiPaperQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      number: z.string().min(1),
      subquestion: z.string().optional(),
      text: z.string().min(1),
      marks: z.number().positive().max(500).optional(),
      confidence: z.number().min(0).max(1).optional(),
      unit: z.string().max(256).optional(),
      topic: z.string().max(256).optional(),
      suggestedCoCode: z.string().max(32).optional(),
      bloomLevel: z.string().max(64).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    }),
  ),
});

export type AiPaperQuestionsPayload = z.infer<typeof aiPaperQuestionsSchema>;

export const analyzedQuestionSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  subquestion: z.string().optional(),
  text: z.string(),
  marks: z.number().positive().max(500).optional(),
  marksSource: z.enum(['detected', 'inferred', 'teacher', 'unknown']),
  reviewStatus: z.enum(['OK', 'NEEDS_REVIEW', 'SUGGESTION_ONLY']),
  confidence: z.number().min(0).max(1),
  suggestions: z
    .object({
      unit: z.object({ value: z.string(), confidence: z.number() }).optional(),
      topic: z.object({ value: z.string(), confidence: z.number() }).optional(),
      courseOutcome: z
        .object({
          code: z.string().optional(),
          confidence: z.number(),
          confirmed: z.literal(false),
        })
        .optional(),
      bloomLevel: z.object({ value: z.string(), confidence: z.number() }).optional(),
      difficulty: z.object({ value: z.string(), confidence: z.number() }).optional(),
    })
    .optional(),
  teacherCorrections: z.record(z.unknown()).optional(),
});

export const analysisReportSchema = z.object({
  totals: z.object({
    questionCount: z.number().int().nonnegative(),
    marksTotal: z.number().nonnegative(),
    marksKnown: z.number().nonnegative(),
    marksUnknown: z.number().nonnegative(),
  }),
  marksDistribution: z.record(z.string(), z.number().nonnegative()),
  questions: z.array(analyzedQuestionSchema),
  reviewRequired: z.boolean(),
  reviewReasons: z.array(z.string()),
  pipeline: z
    .object({
      kind: z.string(),
      ocrConfidence: z.number().optional(),
      pageCount: z.number().int().nonnegative(),
    })
    .optional(),
});

export type AnalysisReport = z.infer<typeof analysisReportSchema>;