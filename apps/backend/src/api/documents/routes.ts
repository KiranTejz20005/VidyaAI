import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uploadMiddleware } from '../../middlewares/upload.middleware';
import { uploadRateLimiter } from '../../middlewares/rate-limit.middleware';
import {
  uploadDocument,
  parseDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  processDocument,
  checkDocumentJob,
} from './controller';
import {
  parseDocumentSchema,
  processDocumentSchema,
  listDocumentsSchema,
  documentIdParamSchema,
  checkJobStatusSchema,
  deleteDocumentSchema,
} from './validators';

const router = Router();

router.use(authenticate);

// KnowledgeDocument has no owner column, so mutations are limited to staff of the tenant (students may only read).
const staffOnly = authorize(['TEACHER', 'ADMIN']);

router.post('/upload', staffOnly, uploadRateLimiter, uploadMiddleware.single('file'), asyncHandler(uploadDocument));
router.post('/parse', staffOnly, validate(parseDocumentSchema), asyncHandler(parseDocument));
router.get('/', validate(listDocumentsSchema), asyncHandler(listDocuments));
router.get('/:id', validate(documentIdParamSchema), asyncHandler(getDocument));
router.delete('/:id', staffOnly, validate(deleteDocumentSchema), asyncHandler(deleteDocument));
router.post('/:id/process', staffOnly, validate(processDocumentSchema), asyncHandler(processDocument));
router.get('/:id/jobs/:jobId', validate(checkJobStatusSchema), asyncHandler(checkDocumentJob));

export default router;
