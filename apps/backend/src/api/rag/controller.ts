import { Request, Response } from 'express';
import OpenAI from 'openai';
import prisma from '../../config/prisma';
import { env } from '../../config/env';
import { requireRequestOrgId } from '../../security/request-context';
import { parsePagination, buildPagination } from '../common/pagination';
import { sendSuccess, sendAccepted } from '../common/response';
import { ApiError } from '../common/errors';
import { ingestionQueue } from '../../queues/ingestion.queue';
import { advancedRetrieveContext } from '../../services/rag/retriever.service';
import { performVectorSearch } from '../../services/rag/vector-search.service';
import { performBM25Search } from '../../services/rag/bm25.service';

import {
  serializeSearchResult,
  serializeRetrieveResponse,
  serializeIndexedDocument,
  serializeRagQueryResponse,
  serializeRagStats,
} from './serializers';
import type { SearchRequestDto, RetrieveRequestDto, RagQueryRequestDto } from './dto';

const ALLOWED_RAG_MODELS = new Set(['gpt-4o-mini', 'gpt-4o']);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY || '' });

export async function search(req: Request, res: Response): Promise<void> {
  const body = req.body as SearchRequestDto;
  const orgId = requireRequestOrgId(req);

  const [vectorResults, bm25Results] = await Promise.all([
    performVectorSearch(body.query, orgId),
    performBM25Search(body.query, orgId),
  ]);

  const chunkScores = new Map<string, { chunk: any; score: number }>();

  for (const v of vectorResults) {
    if (v.score > 0.5) {
      chunkScores.set(v.chunk.id, { chunk: v.chunk, score: v.score * 2 });
    }
  }

  for (const b of bm25Results) {
    const existing = chunkScores.get(b.chunk.id);
    if (existing) {
      existing.score += b.score * 0.5;
    } else {
      chunkScores.set(b.chunk.id, { chunk: b.chunk, score: b.score });
    }
  }

  const limit = body.limit ?? 10;
  const fusedResults = Array.from(chunkScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const results = fusedResults.map((r) =>
    serializeSearchResult({
      chunkId: r.chunk.id,
      content: r.chunk.content,
      score: r.score,
      metadata: r.chunk.metadata as Record<string, unknown> | null,
      documentId: r.chunk.documentId,
      documentFilename: r.chunk.document?.filename || 'Unknown',
    })
  );

  sendSuccess(res, { data: results });
}

export async function retrieve(req: Request, res: Response): Promise<void> {
  const body = req.body as RetrieveRequestDto;
  const orgId = requireRequestOrgId(req);

  const context = await advancedRetrieveContext(body.query, orgId, body.limit ?? 5);

  const chunks = context
    ? context
        .split('--- CHUNK')
        .filter(Boolean)
        .map((c, i) => ({
          chunkId: `chunk-${i}`,
          content: c.trim(),
          score: 0,
          metadata: null,
          documentId: '',
          documentFilename: '',
        }))
    : [];

  sendSuccess(res, {
    data: serializeRetrieveResponse({
      context,
      chunks: chunks as any,
      totalChunks: chunks.length,
    }),
  });
}

export async function listIndexedDocuments(req: Request, res: Response): Promise<void> {
  const { page, limit, sort, order } = parsePagination(req);
  const orgId = requireRequestOrgId(req);
  const status = req.query.status as string | undefined;

  const where: any = { organizationId: orgId };
  if (status) where.status = status;

  const [documents, total] = await Promise.all([
    prisma.knowledgeDocument.findMany({
      where,
      orderBy: { [sort]: order },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { chunks: true } } },
    }),
    prisma.knowledgeDocument.count({ where }),
  ]);

  sendSuccess(res, {
    data: documents.map(serializeIndexedDocument as any),
    pagination: buildPagination(page, limit, total),
  });
}

export async function reindexDocument(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const orgId = requireRequestOrgId(req);

  const document = await prisma.knowledgeDocument.findFirst({ where: { id, organizationId: orgId } });
  if (!document) throw ApiError.notFound('Document not found');

  // Existing chunks stay searchable until the new ones are fully embedded; the
  // worker swaps them atomically.
  const job = await ingestionQueue.add('process-document', { documentId: id }, { jobId: `doc-${id}-${Date.now()}` });
  await prisma.knowledgeDocument.update({ where: { id }, data: { status: 'GENERATING' } });

  sendAccepted(res, { documentId: id, jobId: job.id, status: 'queued' });
}

export async function ragQuery(req: Request, res: Response): Promise<void> {
  if (!env.OPENAI_API_KEY) throw ApiError.internal('OpenAI API key not configured');

  const body = req.body as RagQueryRequestDto;
  const orgId = requireRequestOrgId(req);

  const startTime = Date.now();

  // Context always comes from this organization's own knowledge base; callers cannot
  // inject their own context, system prompt or an arbitrary model.
  const context = await advancedRetrieveContext(body.query, orgId, 5);

  const systemPrompt = 'You are a helpful educational assistant. Answer only from the provided context. If the context does not contain the answer, say so.';
  const model = ALLOWED_RAG_MODELS.has(body.model ?? '') ? (body.model as string) : 'gpt-4o-mini';

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${body.query}` },
    ],
  });

  const latencyMs = Date.now() - startTime;

  sendSuccess(res, {
    data: serializeRagQueryResponse({
      answer: response.choices[0].message.content || '',
      context,
      chunksUsed: context ? context.split('--- CHUNK').length : 0,
      model,
      latencyMs,
    }),
  });
}

export async function getStats(req: Request, res: Response): Promise<void> {
  const orgId = requireRequestOrgId(req);

  const [totalDocuments, totalChunks] = await Promise.all([
    prisma.knowledgeDocument.count({ where: { organizationId: orgId } }),
    prisma.knowledgeChunk.count({ where: { document: { organizationId: orgId } } }),
  ]);

  const lastDocument = await prisma.knowledgeDocument.findFirst({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  sendSuccess(res, {
    data: serializeRagStats({
      totalDocuments,
      totalChunks,
      averageChunksPerDocument: totalDocuments > 0 ? Math.round((totalChunks / totalDocuments) * 100) / 100 : 0,
      documentsByStatus: {},
      lastIndexedAt: lastDocument?.createdAt.toISOString() || null,
    }),
  });
}
