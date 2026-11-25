import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireRole } from '../../security/role.middleware';
import { requireRequestOrgId } from '../../security/request-context';
import { validate } from '../../middlewares/validate.middleware';
import { uploadMiddleware } from '../../middlewares/upload.middleware';
import { sendSuccess, sendCreated } from '../common/response';
import { ApiError } from '../common/errors';
import {
  analyzeJobIdParamSchema,
  analyzeQuestionPaperBodySchema,
  patchAnalysisQuestionsSchema,
} from './analysis-validators';
import {
  getQuestionPaperAnalysisJob,
  patchAnalysisQuestionCorrections,
  resolveAnalysisBuffer,
  startQuestionPaperAnalysis,
} from '../../services/question-paper/analysis.service';

const router = Router();

router.use(requireRole('ADMIN', 'TEACHER'));

async function analyzeQuestionPaper(req: Request, res: Response): Promise<void> {
  const orgId = requireRequestOrgId(req);
  const { preferHandwriting, useAiEnrichment, storageKey, filename, mimeType } = req.body;

  if (!req.file && !storageKey) {
    throw ApiError.badRequest('Provide multipart file or storageKey after upload');
  }
  if (!req.file && (!filename || !mimeType)) {
    throw ApiError.badRequest('filename and mimeType are required with storageKey');
  }

  const resolved = await resolveAnalysisBuffer({
    file: req.file,
    storageKey,
    organizationId: orgId,
  });

  const filenameFinal = filename ?? resolved.filename;
  const mimeFinal = mimeType ?? resolved.mimeType;

  const idempotencyKey =
    typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;

  const result = await startQuestionPaperAnalysis({
    organizationId: orgId,
    buffer: resolved.buffer,
    filename: filenameFinal,
    mimeType: mimeFinal,
    storageKey: storageKey ?? resolved.storageKey,
    preferHandwriting: preferHandwriting,
    useAiEnrichment: useAiEnrichment,
    idempotencyKey,
  });

  sendCreated(res, {
    data: {
      jobId: result.jobId,
      status: result.status,
      ...result.report,
    },
  });
}

async function getAnalyzeJob(req: Request, res: Response): Promise<void> {
  const orgId = requireRequestOrgId(req);
  const { jobId } = req.params;

  const job = await getQuestionPaperAnalysisJob(orgId, jobId);
  if (job.status === 'NOT_FOUND') {
    throw ApiError.notFound('Analysis job not found');
  }

  sendSuccess(res, {
    data: {
      jobId: job.jobId,
      status: job.status,
      report: job.report,
      error: job.error,
    },
  });
}

async function patchAnalyzeQuestions(req: Request, res: Response): Promise<void> {
  const orgId = requireRequestOrgId(req);
  const { jobId } = req.params;

  try {
    const report = await patchAnalysisQuestionCorrections(orgId, jobId, req.body.questions);
    sendSuccess(res, { data: { jobId, report } });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw ApiError.notFound(err.message);
    }
    if (err instanceof Error && err.message.includes('not ready')) {
      throw ApiError.badRequest(err.message);
    }
    throw err;
  }
}

router.post(
  '/',
  uploadMiddleware.single('file'),
  validate(analyzeQuestionPaperBodySchema),
  asyncHandler(analyzeQuestionPaper),
);

router.patch(
  '/:jobId/questions',
  validate(patchAnalysisQuestionsSchema),
  asyncHandler(patchAnalyzeQuestions),
);

router.get('/:jobId', validate(analyzeJobIdParamSchema), asyncHandler(getAnalyzeJob));

export default router;