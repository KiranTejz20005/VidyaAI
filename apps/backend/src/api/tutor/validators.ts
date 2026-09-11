import { z } from 'zod';

const sessionIdSchema = z.string().refine(
  (val) => val === 'default' || z.string().uuid().safeParse(val).success,
  { message: 'Invalid session ID' }
);

export const createSessionSchema = z.object({
  body: z.object({
    subject: z.string().min(1).max(200),
    tutorMode: z.string().optional().default('SOCRATIC'),
  }),
});

export const sendMessageSchema = z.object({
  params: z.object({
    sessionId: sessionIdSchema,
  }),
  body: z.object({
    message: z.string().min(1).max(5000),
    mode: z.string().optional(),
  }),
});

export const sessionIdParamSchema = z.object({
  params: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const updateConfigSchema = z.object({
  body: z.object({
    allowDirectAnswers: z.boolean().optional(),
    maxExplanationDepth: z.number().int().min(1).max(10).optional(),
  }),
});
