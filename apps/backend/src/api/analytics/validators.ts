import { z } from 'zod';

export const studentPerformanceQuerySchema = z.object({
  query: z.object({
    studentId: z.string().uuid(),
  }),
});
