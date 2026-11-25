import prisma from '../config/prisma';
import OpenAI from 'openai';
import { env } from '../config/env';
import { extractTextFromFile } from './grader.service';
import { logger } from '../utils/logger';
import { invalidateByPattern } from '../api/common/cache';
import { randomUUID } from 'crypto';
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY || '' });

import { parseDocumentIntoSemanticChunks } from './document-parser.service';

export async function ingestDocument(
  fileUrl: string,
  fileType: string,
  organizationId: string,
  filename: string,
  _userId: string = 'system',
  options: { documentId?: string } = {},
): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    logger.warn('No OPENAI_API_KEY found, RAG embeddings will be skipped.');
    return '';
  }

  const text = await extractTextFromFile(fileUrl, fileType);
  if (!text) return '';

  const semanticChunks = await parseDocumentIntoSemanticChunks(text);
  
  // ── AUTO-CLASSIFICATION ──
  let category = 'HANDOUT';
  let status = 'ACTIVE';

  // Re-indexing keeps the document's existing classification and approval state.
  if (semanticChunks.length > 0 && !options.documentId) {
    const sampleIndices = [
      0, 
      Math.floor(semanticChunks.length / 2), 
      semanticChunks.length - 1
    ];
    const uniqueIndices = [...new Set(sampleIndices)];
    const sampleText = uniqueIndices.map(i => semanticChunks[i].content).join('\n\n---\n\n');

    const prompt = `System: You are an academic classifier. Analyze the following document excerpts.
Classify this document strictly as one of the following categories: 'HANDOUT', 'SYLLABUS', 'ASSESSMENT', 'LAB_MANUAL'.
Respond with the exact word and nothing else.

Excerpts:
${sampleText}`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
      });

      const verdict = completion.choices[0].message.content?.trim();
      
      if (['HANDOUT', 'SYLLABUS', 'ASSESSMENT', 'LAB_MANUAL'].includes(verdict || '')) {
        category = verdict as string;
      }

      if (category === 'ASSESSMENT') {
        status = 'PENDING_APPROVAL';
        
        // Notify Admins
        const admins = await prisma.user.findMany({
          where: { organizationId, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
          select: { id: true }
        });

        if (admins.length > 0) {
          await prisma.notification.createMany({
            data: admins.map(admin => ({
              userId: admin.id,
              organizationId,
              title: '📝 Assessment Requires Approval',
              message: `An Assessment (${filename}) was automatically routed to your queue for review.`,
              type: 'INFO',
            }))
          });
        }
      }
    } catch (llmErr) {
      logger.error(`[AUTO-CLASSIFICATION] Failed to run classification, defaulting to HANDOUT: ${llmErr}`);
    }
  }

  // Embed every chunk first. Nothing is written until all embeddings succeed, so a
  // failure part-way through can never leave a document with half its chunks.
  const chunkIds = semanticChunks.map(() => randomUUID());
  const prepared: { id: string; content: string; vector: string; metadata: Record<string, unknown> }[] = [];
  for (let i = 0; i < semanticChunks.length; i++) {
    const chunkObj = semanticChunks[i];
    const response = await openai.embeddings.create({ model: 'text-embedding-3-small', input: chunkObj.content });
    prepared.push({
      id: chunkIds[i],
      content: chunkObj.content,
      vector: `[${response.data[0].embedding.join(',')}]`,
      metadata: {
        ...chunkObj.metadata,
        chunkType: chunkObj.chunkType,
        prevChunkId: i > 0 ? chunkIds[i - 1] : null,
        nextChunkId: i < chunkIds.length - 1 ? chunkIds[i + 1] : null,
      },
    });
  }

  const docId = await prisma.$transaction(async (tx) => {
    let id: string;
    if (options.documentId) {
      const existing = await tx.knowledgeDocument.findFirst({
        where: { id: options.documentId, organizationId },
        select: { id: true },
      });
      if (!existing) throw new Error('Document not found in this organization');
      id = existing.id;
      await tx.knowledgeChunk.deleteMany({ where: { documentId: id } });
      await tx.knowledgeDocument.update({ where: { id }, data: { status: 'ACTIVE' } });
    } else {
      id = (await tx.knowledgeDocument.create({
        data: { filename, fileUrl, organizationId, category, status: status as any },
      })).id;
    }
    for (const row of prepared) {
      await tx.$executeRaw`
        INSERT INTO "KnowledgeChunk" ("id", "documentId", "content", "vector", "metadata", "createdAt")
        VALUES (${row.id}, ${id}, ${row.content}, ${row.vector}::vector, ${row.metadata}::jsonb, NOW())
      `;
    }
    return id;
  }, { timeout: 120_000 });

  // Invalidate cached RAG results for this organization so new embeddings are picked up
  await invalidateByPattern(`rag:${organizationId}:*`).catch(() => {});

  return docId;
}



export { advancedRetrieveContext as retrieveContext, retrieveContextWithSources } from './rag/retriever.service';
export type { RagSourceCitation } from './rag/retriever.service';
