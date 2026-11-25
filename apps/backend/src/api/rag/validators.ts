import { z } from 'zod';
import { paginationQuerySchema } from '../common/validators';

export const searchSchema = z.object({
  body: z.object({
    query: z.string().min(1).max(5000),
    limit: z.number().int().min(1).max(50).optional().default(10),
    filters: z.record(z.unknown()).optional(),
  }),
});

export const retrieveSchema = z.object({
  body: z.object({
    query: z.string().min(1).max(5000),
    limit: z.number().int().min(1).max(50).optional().default(5),
  }),
});

export const listIndexedDocumentsSchema = z.object({
  query: paginationQuerySchema.shape.query.extend({
    status: z.string().optional(),
  }),
});

export const reindexDocumentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const ragQuerySchema = z.object({
  body: z.object({
    query: z.string().min(1).max(5000),
    model: z.string().optional(),
  }),
});


