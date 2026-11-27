// Restart trigger comment
import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import pinoHttp from 'pino-http';
import { csrfProtection } from './middlewares/csrf.middleware';

import { QueueEvents } from 'bullmq';
import { env } from './config/env';
import { closeRedis, closeBullRedis, getBullRedisClient, getBullRedisDiagnostics, getRedisClient, isBullRedisConnected, isRedisConnected } from './config/redis';
import { initializeSocketServer, getSocketServer } from './sockets/socket.server';
import { createAiGenerationWorker, getActiveAiJobCount, getStalledAiJobCount, getAiWorker } from './workers/aiGeneration.worker';
import { createPdfWorker, getPdfWorker } from './workers/pdf.worker';
import prisma from './config/prisma';
import { createIngestionWorker, getIngestionWorker } from './workers/ingestion.worker';
import { createAssessmentWorker, getAssessmentWorker } from './workers/assessment.worker';
import { authenticate } from './middlewares/auth.middleware';
import { verifyAccessToken } from './services/auth.service';
import { emitToAssignment } from './sockets/socket.server';
import apiRouter from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { logger } from './utils/logger';
import { AuditService } from './services/audit.service';
import { globalIpRateLimiter } from './middlewares/rate-limit.middleware';
// createApp() wires ResilientRedisStore into express-rate-limit (Phase 3).
import { ResilientRedisStore } from './api/auth/resilient-store';
import { resolveUploadPath, UnsafePathError } from './utils/safe-path';
import { normalizeRole } from './security/request-context';
import {
  StorageRbacService,
  StorageUserContext,
  effectiveOrgId,
} from './services/storage/storage-rbac.service';

// ── Bootstrap phase tracking ──
let isBootstrapping = false;
let bootstrapPhase = 'init';
const healthState = { redis: 'disconnected', bullmqRedis: 'disconnected', workers: 'none' };
let queueTimeoutMonitor: NodeJS.Timeout | null = null;
let stallMonitorInterval: NodeJS.Timeout | null = null;
let generationQueueEvents: QueueEvents | null = null;
let pdfQueueEvents: QueueEvents | null = null;

const QUEUE_TIMEOUT_MS = 2 * 60 * 1000;
const QUEUE_SWEEP_INTERVAL_MS = env.QUEUE_SWEEP_INTERVAL_MS;
const IN_PROGRESS_STUCK_TIMEOUT_MS = 10 * 60 * 1000;
const STALL_MONITOR_INTERVAL_MS = env.STALL_MONITOR_INTERVAL_MS;

function logBoot(phase: string, message: string) {
  bootstrapPhase = phase;
  logger.info(`[BOOT:${phase}] ${message}`);
}

process.on('uncaughtException', (error) => {
  logger.error(`[FATAL:uncaughtException] ${error.message}`);
  if (error.stack) logger.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`[FATAL:unhandledRejection] ${String(reason)}`);
  if (reason instanceof Error && reason.stack) logger.error(reason.stack);
  process.exit(1);
});

function buildStorageUserContext(req: Request): StorageUserContext | null {
  const user = req.user;
  if (!user?.id) return null;
  const role = normalizeRole(user.role);
  const orgId = role === 'SUPER_ADMIN'
    ? user.activeOrganizationId || user.organizationId
    : user.organizationId || user.activeOrganizationId;
  return {
    id: user.id,
    role,
    organizationId: effectiveOrgId(orgId),
    email: user.email ?? null,
  };
}

async function findStoredFileForLocalPath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const basename = path.posix.basename(normalized);
  const candidates = Array.from(new Set([normalized, `uploads/${normalized}`, basename]));
  const exact = await prisma.storedFile.findFirst({
    where: { OR: candidates.map((key) => ({ key })) },
  });
  if (exact) return exact;
  return prisma.storedFile.findFirst({
    where: {
      OR: [
        { key: { endsWith: `/${basename}` } },
        { key: { endsWith: `-${basename}` } },
      ],
    },
  });
}

async function canAccessLegacyLocalUpload(user: StorageUserContext, publicUrl: string): Promise<boolean> {
  const role = normalizeRole(user.role);
  if (role === 'SUPER_ADMIN') return true;

  const userOrg = effectiveOrgId(user.organizationId);
  if (!userOrg) return false;

  const library = await prisma.libraryResource.findFirst({ where: { fileUrl: publicUrl } });
  if (library) {
    return library.organizationId === userOrg;
  }

  const submission = await prisma.studentSubmission.findFirst({ where: { fileUrl: publicUrl } });
  if (submission) {
    if (submission.organizationId !== userOrg) return false;
    if (submission.studentId === user.id) return true;
    return role === 'ADMIN' || role === 'TEACHER';
  }

  return false;
}

function applySecureDownloadHeaders(res: Response): void {
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
}

function createSecureLocalUploadsHandler(uploadRoot: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = buildStorageUserContext(req);
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const relativePath = (req.path || '/').replace(/^\/+/, '');
      if (!relativePath || relativePath.includes('\0')) {
        res.status(400).json({ success: false, error: 'Invalid path' });
        return;
      }

      let absolutePath: string;
      try {
        absolutePath = resolveUploadPath(`/uploads/${relativePath}`, uploadRoot);
      } catch (err) {
        if (err instanceof UnsafePathError) {
          res.status(400).json({ success: false, error: 'Invalid path' });
          return;
        }
        throw err;
      }

      if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
        res.status(404).json({ success: false, error: 'File not found' });
        return;
      }

      const publicUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
      const storedFile = await findStoredFileForLocalPath(relativePath);

      if (storedFile) {
        const allowed = await StorageRbacService.canAccessFile(user, 'file:read', storedFile);
        if (!allowed) {
          res.status(403).json({ success: false, error: 'You do not have permission to access this file' });
          return;
        }
      } else {
        const allowed = await canAccessLegacyLocalUpload(user, publicUrl);
        if (!allowed) {
          res.status(403).json({ success: false, error: 'You do not have permission to access this file' });
          return;
        }
      }

      applySecureDownloadHeaders(res);
      res.sendFile(absolutePath, (err) => {
        if (err) next(err);
      });
    } catch (err) {
      next(err);
    }
  };
}

function parseCorsOrigins(raw?: string): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://vidhyaai.tech',
    'https://www.vidhyaai.tech',
    'https://api.vidhyaai.tech',
    'https://vidyaai.tech',
    'https://www.vidyaai.tech',
  ]);

  if (raw) {
    const parsed = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\/+$/, ''));

    for (const item of parsed) {
      origins.add(item);
      try {
        const u = new URL(item);
        if (u.hostname.startsWith('www.')) {
          origins.add(`${u.protocol}//${u.hostname.slice(4)}${u.port ? ':' + u.port : ''}`);
        } else if (!u.hostname.startsWith('localhost') && !u.hostname.startsWith('127.')) {
          origins.add(`${u.protocol}//www.${u.hostname}${u.port ? ':' + u.port : ''}`);
        }
      } catch {
        // ignore invalid URL string
      }
    }
  }

  return Array.from(origins);
}

async function failStaleQueuedJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - QUEUE_TIMEOUT_MS);
  const staleJobs = await prisma.generationJob.findMany({
    where: { status: 'queued', createdAt: { lte: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 25,
  });

  for (const job of staleJobs) {
    const assignmentId = job.assignmentId;

    await Promise.allSettled([
      prisma.assignment.update({ where: { id: assignmentId }, data: { status: 'FAILED' } }),
      prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: 'Generation timed out while waiting in queue', completedAt: new Date() },
      }),
    ]);

    emitToAssignment(assignmentId, 'generation:failed', {
      assignmentId,
      error: 'Generation timed out while waiting in queue',
      retryable: true,
      jobRecordId: job.id,
      generationSeq: job.generationSeq ?? 0,
      version: job.progressVersion ?? 0,
      ts: Date.now(),
    });

    logger.warn(`Generation job ${job.id} timed out in queue and was marked failed`);
  }
}

async function failStaleInProgressJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - IN_PROGRESS_STUCK_TIMEOUT_MS);
  const staleJobs = await prisma.generationJob.findMany({
    where: {
      status: { in: ['extracting_content', 'topic_preprocessing', 'generation_planning', 'batch_generating', 'validating', 'answer_key_generating', 'pdf_composing', 'persisting', 'pdf-generating'] },
      updatedAt: { lte: cutoff },
    },
    orderBy: { updatedAt: 'asc' },
    take: 25,
  });

  for (const job of staleJobs) {
    const assignmentId = job.assignmentId;

    await Promise.allSettled([
      prisma.assignment.update({ where: { id: assignmentId }, data: { status: 'FAILED' } }),
      prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: 'Generation appears stuck and was automatically failed', completedAt: new Date() },
      }),
    ]);

    emitToAssignment(assignmentId, 'generation:failed', {
      assignmentId,
      error: 'Generation appears stuck and was automatically failed',
      retryable: true,
      jobRecordId: job.id,
      generationSeq: job.generationSeq ?? 0,
      version: job.progressVersion ?? 0,
      ts: Date.now(),
    });

    logger.warn(`Generation job ${job.id} was stale in-progress and marked failed`);
  }
}

async function initializeWorkers() {
  healthState.workers = 'starting';

  try {
    healthState.bullmqRedis = 'connecting';
    createAiGenerationWorker();
    createPdfWorker();
    createIngestionWorker();
    createAssessmentWorker();
    healthState.bullmqRedis = 'connected';
    healthState.workers = 'running';
    logger.info('[WORKERS] AI + PDF + Ingestion + Assessment workers created');

    const bullConnection = getBullRedisClient();
    generationQueueEvents = new QueueEvents('generation', {
      connection: bullConnection,
      skipVersionCheck: true,
    });
    pdfQueueEvents = new QueueEvents('pdf', {
      connection: bullConnection,
      skipVersionCheck: true,
    });

    generationQueueEvents.on('completed', ({ jobId }) => logger.info(`[QUEUE:generation] completed jobId=${jobId}`));
    generationQueueEvents.on('failed', ({ jobId, failedReason }) => logger.warn(`[QUEUE:generation] failed jobId=${jobId} reason=${failedReason}`));
    generationQueueEvents.on('stalled', ({ jobId }) => logger.error(`[QUEUE:generation] STALLED jobId=${jobId}`));

    pdfQueueEvents.on('completed', ({ jobId }) => logger.info(`[QUEUE:pdf] completed jobId=${jobId}`));
    pdfQueueEvents.on('failed', ({ jobId, failedReason }) => logger.warn(`[QUEUE:pdf] failed jobId=${jobId} reason=${failedReason}`));

    logger.info('[WORKERS] Queue events initialized');
  } catch (error) {
    healthState.workers = 'failed';
    healthState.bullmqRedis = 'error';
    logger.error(`[WORKERS] Failed to initialize: ${error instanceof Error ? error.message : error}`);
    if (env.NODE_ENV === 'production') {
      logger.error('[WORKERS] Workers failed in production — exiting');
      process.exit(1);
    }
  }
}

async function startBackgroundWorkers() {
  logBoot('workers', 'Starting background workers...');
  await initializeWorkers();

  // Queue timeout watchdog
  queueTimeoutMonitor = setInterval(() => {
    void Promise.all([
      failStaleQueuedJobs(),
      failStaleInProgressJobs(),
    ]).catch((e) => logger.error('[WATCHDOG] Sweep failed:', e));
  }, QUEUE_SWEEP_INTERVAL_MS);
  void Promise.all([
    failStaleQueuedJobs(),
    failStaleInProgressJobs(),
  ]).catch((e) => logger.error('[WATCHDOG] Initial sweep failed:', e));

  // Stall monitor
  stallMonitorInterval = setInterval(() => {
    const diag = getBullRedisDiagnostics();
    logger.info(
      `[STALL] redis=${diag.status} connects=${diag.connectCount} reconnects=${diag.reconnectCount} errors=${diag.errorCount} stalled=${getStalledAiJobCount()} active=${getActiveAiJobCount()}`
    );
  }, STALL_MONITOR_INTERVAL_MS);

  // Audit log pruning (Run once every 12 hours)
  setInterval(() => {
    AuditService.pruneOldLogs(15).catch((e) => logger.error('[WATCHDOG] Audit log pruning failed:', e));
  }, 12 * 60 * 60 * 1000);
  // Run once immediately on startup
  AuditService.pruneOldLogs(15).catch((e) => logger.error('[WATCHDOG] Initial audit log pruning failed:', e));

  logBoot('workers', 'Background workers ready');
}

function createApp() {
  const app = express();
  app.use(cookieParser());
  // Render (and similar) terminate TLS at one reverse-proxy hop. Do not raise
  // this without matching the real topology — extra hops let clients spoof XFF.
  app.set('trust proxy', 1);

  const corsOrigins = parseCorsOrigins(env.FRONTEND_URL);

  const corsMiddleware = cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/+$/, '');
      const allowed = corsOrigins.includes(normalizedOrigin);
      if (!allowed) {
        logger.warn(`[CORS] Blocked origin: ${normalizedOrigin}`);
      }
      callback(null, allowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'x-csrf-token',
      'X-Request-Id',
      'x-request-id',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
      'Cache-Control',
      'Pragma',
    ],
    optionsSuccessStatus: 204,
  });
  app.use(corsMiddleware);
  app.options('*', corsMiddleware);

  // CSRF protection (double-submit cookie pattern) — skip webhook endpoints
  app.use('/api/webhook', (_req, _res, next) => next());
  app.use(csrfProtection);


  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        fontSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(compression());

  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    (req as any).requestId = requestId;
    // Attach a request-correlated pino child logger. The getter re-reads
    // `req.user` on each access so userId/orgId are bound once auth runs.
    Object.defineProperty(req, 'logger', {
      configurable: true,
      enumerable: false,
      get() {
        const user = (req as any).user;
        return logger.child({
          requestId,
          userId: user?.id,
          orgId: user?.activeOrganizationId ?? user?.organizationId ?? undefined,
        });
      },
    });
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(pinoHttp({
    logger,
    quietReqLogger: true,
    customLogLevel: function (res, _err) {
      if ((res.statusCode ?? 500) >= 500) return 'error';
      if ((res.statusCode ?? 400) >= 400) return 'warn';
      return 'info';
    },
  }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 20000 : 3000,
    store: new ResilientRedisStore('api'),
    keyGenerator: (req) => {
      const header = req.headers.authorization;
      if (header && header.startsWith('Bearer ')) {
        try {
          return `u:${verifyAccessToken(header.slice(7).trim()).userId}`;
        } catch {
          // fall through to the IP key
        }
      }
      return `ip:${req.ip}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later.' },
  });
  app.use('/api', globalIpRateLimiter);
  app.use('/api', limiter);

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  const secureLocalUploads = createSecureLocalUploadsHandler(uploadsDir);
  // Local upload files: authenticated + tenant/ownership checks via StoredFile RBAC
  // (legacy library/submission URLs when no StoredFile row matches the path).
  app.use(['/uploads', '/api/uploads', '/api/v1/uploads'], authenticate, secureLocalUploads);

  app.use('/api', apiRouter);

  return app;
}

async function bootstrap() {
  if (isBootstrapping) {
    logger.warn('[BOOT] Bootstrap already running — skipping');
    return;
  }
  isBootstrapping = true;
  logBoot('init', `Starting backend — mode=${env.RENDER_WORKER_MODE}, env=${env.NODE_ENV}`);

  // ── Step 1: Connect to Redis (fail fast) ──
  logBoot('redis', 'Connecting to Redis...');
  try {
    const generalRedis = getRedisClient();
    const bullRedis = getBullRedisClient();
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const onReady = () => { generalRedis.removeListener('error', onError); resolve(); };
        const onError = (err: Error) => { generalRedis.removeListener('ready', onReady); reject(err); };
        generalRedis.once('ready', onReady);
        generalRedis.once('error', onError);
      }),
      new Promise<void>((resolve, reject) => {
        const onReady = () => { bullRedis.removeListener('error', onError); resolve(); };
        const onError = (err: Error) => { bullRedis.removeListener('ready', onReady); reject(err); };
        bullRedis.once('ready', onReady);
        bullRedis.once('error', onError);
      }),
    ]);
    healthState.redis = 'connected';
    healthState.bullmqRedis = 'connected';
    logBoot('redis', 'Redis connected');
  } catch (error) {
    healthState.redis = 'error';
    healthState.bullmqRedis = 'error';
    logger.error(`[BOOT:redis] Connection failed: ${error instanceof Error ? error.message : error}`);
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  // ── Step 3: Create Express app ──
  logBoot('express', 'Creating Express app');
  const app = createApp();
  const httpServer = http.createServer(app);

  // Liveness probe - is the process alive?
  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
  });

  // Readiness probe - is the app ready to serve?
  app.get('/health/ready', async (_req, res) => {
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisOk = isRedisConnected();
    const healthy = dbOk && redisOk;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ready' : 'not_ready',
      checks: { database: dbOk, redis: redisOk, workers: healthState.workers },
      timestamp: new Date().toISOString(),
    });
  });

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: bootstrapPhase === 'ready' ? 'ok' : 'starting',
      phase: bootstrapPhase,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        db: 'prisma-postgresql',
        ...healthState,
        redis: isRedisConnected() ? 'connected' : healthState.redis,
        bullmqRedis: isBullRedisConnected() ? 'connected' : healthState.bullmqRedis,
      },
    });
  });

  // Service info endpoint to avoid ambiguous root-path 404 in platform probes/manual checks.
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      service: 'vidyaai-api',
      status: bootstrapPhase === 'ready' ? 'ok' : 'starting',
      endpoints: {
        health: '/health',
        api: '/api',
      },
    });
  });

  // ── Step 4: Initialize Socket.IO ──
  logBoot('socket', 'Initializing Socket.IO');
  initializeSocketServer(httpServer);

  // ── Step 5: Start HTTP server ──
  const port = env.PORT;
  httpServer.listen(port, () => {
    logger.info(`[BOOT:ready] Backend running on port ${port}`);
    logger.info('[BOOT:ready] Socket.IO ready');
    logger.info(`[BOOT:ready] Environment: ${env.NODE_ENV} | Mode: ${env.RENDER_WORKER_MODE}`);
    logBoot('ready', `Listening on port ${port}`);
  });

  // ── Step 6: Start workers based on mode ──
  if (env.RENDER_WORKER_MODE === 'worker' || env.RENDER_WORKER_MODE === 'both') {
    if (env.ENABLE_BACKGROUND_WORKERS) {
      startBackgroundWorkers().catch((error) => {
        logger.error(`[BOOT:workers] Failed: ${error instanceof Error ? error.message : error}`);
      });
    } else {
      logBoot('workers', 'Background workers disabled by ENABLE_BACKGROUND_WORKERS=false');
      healthState.workers = 'disabled';
    }
  } else {
    logBoot('workers', 'Worker mode=web — not starting background workers');
    healthState.workers = 'web-only';
  }

  // ── Step 7: Graceful shutdown ──
  const shutdown = async (signal: string) => {
    logger.info(`[SHUTDOWN] ${signal} received. Shutting down...`);
    isBootstrapping = false;
    if (queueTimeoutMonitor) { clearInterval(queueTimeoutMonitor); queueTimeoutMonitor = null; }
    if (stallMonitorInterval) { clearInterval(stallMonitorInterval); stallMonitorInterval = null; }

    const io = getSocketServer();
    io.close();
    const httpClosed = new Promise<void>((resolve) => httpServer.close(() => resolve()));

    if (generationQueueEvents) { await generationQueueEvents.close().catch(() => {}); generationQueueEvents = null; }
    if (pdfQueueEvents) { await pdfQueueEvents.close().catch(() => {}); pdfQueueEvents = null; }

    const aiWorker = getAiWorker();
    if (aiWorker) { await aiWorker.close().catch(() => {}); }
    const pdfWorker = getPdfWorker();
    if (pdfWorker) { await pdfWorker.close().catch(() => {}); }
    const ingestionWorker = getIngestionWorker();
    if (ingestionWorker) { await ingestionWorker.close().catch(() => {}); }
    const assessmentWorker = getAssessmentWorker();
    if (assessmentWorker) { await assessmentWorker.close().catch(() => {}); }

    await httpClosed;
    logger.info('[SHUTDOWN] HTTP server closed');
    await Promise.allSettled([closeRedis(), closeBullRedis()]);
    process.exit(0);
    setTimeout(() => {
      logger.warn('[SHUTDOWN] Timed out — forcing exit');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Keep fallback/error handlers last so all routes (including /health) remain reachable.
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });
  app.use(errorMiddleware);
}

logBoot('start', 'Calling bootstrap()');
bootstrap().catch((error) => {
  logger.error(`[BOOT:FATAL] ${error instanceof Error ? error.message : error}`);
  if (error instanceof Error && error.stack) logger.error(error.stack);
  process.exit(1);
});
