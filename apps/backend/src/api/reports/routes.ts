import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../security/role.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  generateAssignmentReportSchema,
  jobIdParamSchema,
  assignmentIdParamSchema,
  studentIdParamSchema,
  classIdParamSchema,
  orgIdParamSchema,
  reportIdParamSchema,
} from './validators';
import {
  generateAssignmentReport,
  getReportStatus,
  getAssignmentReport,
  getStudentReport,
  getClassReport,
  getOrganizationReport,
  downloadReport,
} from './controller';

const router = Router();

router.use(authenticate);

router.post('/generate/assignment', validate(generateAssignmentReportSchema), requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN'), asyncHandler(generateAssignmentReport));
router.get('/generate/:jobId', validate(jobIdParamSchema), requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN'), asyncHandler(getReportStatus));

router.get('/assignment/:assignmentId', validate(assignmentIdParamSchema), requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN'), asyncHandler(getAssignmentReport));
router.get('/student/:studentId', validate(studentIdParamSchema), asyncHandler(getStudentReport));
router.get('/class/:classId', validate(classIdParamSchema), requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN'), asyncHandler(getClassReport));
router.get('/organization/:orgId', validate(orgIdParamSchema), requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(getOrganizationReport));
router.get('/download/:reportId', validate(reportIdParamSchema), requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN'), asyncHandler(downloadReport));

export default router;
