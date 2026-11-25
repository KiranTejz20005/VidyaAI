import { Worker, Job } from 'bullmq';
import { getBullRedisClient } from '../config/redis';
import { INGESTION_QUEUE_NAME } from '../queues/ingestion.queue';
import { ingestDocument } from '../services/rag.service';
import prisma from '../config/prisma';
import path from 'path';
import { logger } from '../utils/logger';

interface IngestionJobData {
  /** Existing KnowledgeDocument to (re)index. When set, file details are read from the stored record. */
  documentId?: string;
  fileUrl?: string;
  fileType?: string;
  organizationId?: string;
  filename?: string;
  userId?: string; // The user who uploaded the file
}

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export function getIngestionWorker(): Worker<IngestionJobData> | null {
  return ingestionWorker;
}

let ingestionWorker: Worker<IngestionJobData> | null = null;

export function createIngestionWorker(): Worker<IngestionJobData> {
  if (ingestionWorker) return ingestionWorker;
  ingestionWorker = new Worker<IngestionJobData>(
  INGESTION_QUEUE_NAME,
  async (job: Job<IngestionJobData>) => {
    const data = job.data;
    let { fileUrl, fileType, organizationId, filename } = data;
    const userId = data.userId ?? 'system';

    // By-ID jobs take every field from the stored record, never from the job payload.
    if (data.documentId) {
      const doc = await prisma.knowledgeDocument.findUnique({ where: { id: data.documentId } });
      if (!doc) throw new Error(`Document ${data.documentId} no longer exists`);
      fileUrl = doc.fileUrl;
      filename = doc.filename;
      organizationId = doc.organizationId;
      fileType = EXT_MIME[path.extname(doc.filename).toLowerCase()] ?? 'application/octet-stream';
      await prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { status: 'GENERATING' } });
    }
    if (!fileUrl || !fileType || !organizationId || !filename) throw new Error('Ingestion job is missing required fields');
    logger.info(`Processing ingestion job ${job.id} for file: ${filename}`);

    try {
      await ingestDocument(fileUrl, fileType, organizationId, filename, userId, { documentId: data.documentId });
      logger.info(`Successfully ingested document: ${filename}`);
    } catch (error) {
      logger.error(`Error ingesting document ${filename}: ${error}`);
      if (data.documentId) {
        await prisma.knowledgeDocument.update({ where: { id: data.documentId }, data: { status: 'FAILED' } }).catch(() => undefined);
      }
      throw error;
    }
  },
  { connection: getBullRedisClient(), concurrency: 5 } // Process up to 5 documents concurrently
);

  ingestionWorker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed with error: ${err.message}`);
  });
  return ingestionWorker;
}
