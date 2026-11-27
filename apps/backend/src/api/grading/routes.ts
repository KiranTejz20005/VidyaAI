import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requireOrganizationScope } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { requireRole } from '../../security/role.middleware';
import { requirePermission } from '../../security/access-control';
import { PERMISSIONS } from '../../security/permissions';
import {
  saveGradingConfig,
  getGradingConfig,
  listSubmissionsForGrading,
  evaluateSubmissionById,
  getEvaluationResult,
  overrideGrade,
  bulkEvaluate,
  getBulkEvaluateJobStatus,
} from './controller';
import { uploadQuestionPaper, uploadSubmission } from '../../controllers/grader.controller';
import { uploadMiddleware } from '../../middlewares/upload.middleware';
import {
  assignmentIdParamSchema,
  submissionIdParamSchema,
  jobIdParamSchema,
  createGradingConfigSchema,
  gradeOverrideSchema,
} from './validators';

const router = Router();

const gradeStaff = requireRole('TEACHER', 'FACULTY', 'ADMIN', 'SUPER_ADMIN');
const gradePermission = requirePermission(PERMISSIONS.GRADE_ASSESSMENT);

/** Staff paths mirror grader.routes; students may read published results without GRADE_ASSESSMENT. */
const requireGradeAssessmentUnlessStudent = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role === 'STUDENT') {
    return next();
  }
  return gradePermission(req, res, next);
};

router.use(authenticate);
router.use(requireOrganizationScope());

router.post(
  '/config/:assignmentId',
  gradeStaff,
  gradePermission,
  validate(assignmentIdParamSchema.merge(createGradingConfigSchema)),
  asyncHandler(saveGradingConfig),
);
router.get(
  '/config/:assignmentId',
  gradeStaff,
  gradePermission,
  validate(assignmentIdParamSchema),
  asyncHandler(getGradingConfig),
);
router.get(
  '/submissions/:assignmentId',
  gradeStaff,
  gradePermission,
  validate(assignmentIdParamSchema),
  asyncHandler(listSubmissionsForGrading),
);
router.post(
  '/question-paper/:assignmentId',
  gradeStaff,
  gradePermission,
  validate(assignmentIdParamSchema),
  uploadMiddleware.single('questionPaper'),
  asyncHandler(uploadQuestionPaper),
);
router.post(
  '/submissions/:assignmentId',
  gradeStaff,
  gradePermission,
  validate(assignmentIdParamSchema),
  uploadMiddleware.array('files', 10),
  asyncHandler(uploadSubmission),
);
router.post(
  '/submissions/:submissionId/evaluate',
  gradeStaff,
  gradePermission,
  validate(submissionIdParamSchema),
  asyncHandler(evaluateSubmissionById),
);
router.get(
  '/submissions/:submissionId/evaluation',
  requireRole('TEACHER', 'FACULTY', 'ADMIN', 'SUPER_ADMIN', 'STUDENT'),
  requireGradeAssessmentUnlessStudent,
  validate(submissionIdParamSchema),
  asyncHandler(getEvaluationResult),
);
router.post(
  '/submissions/:submissionId/override',
  gradeStaff,
  gradePermission,
  validate(gradeOverrideSchema),
  asyncHandler(overrideGrade),
);
router.post(
  '/bulk-evaluate/:assignmentId',
  gradeStaff,
  gradePermission,
  validate(assignmentIdParamSchema),
  asyncHandler(bulkEvaluate),
);
router.get(
  '/bulk-evaluate/:jobId',
  gradeStaff,
  gradePermission,
  validate(jobIdParamSchema),
  asyncHandler(getBulkEvaluateJobStatus),
);

export default router;