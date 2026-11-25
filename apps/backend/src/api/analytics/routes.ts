import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../security/role.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { studentPerformanceQuerySchema } from './validators';
import {
  getDashboard,
  getAssignmentAnalytics,
  getQuizAnalytics,
  getStudentPerformance,
  getTeacherPerformance,
  getUsageStats,
  getAiUsage,
} from './controller';

const router = Router();

router.use(authenticate);

router.get('/dashboard', requireRole('ADMIN'), asyncHandler(getDashboard));
router.get('/assignments', requireRole('TEACHER', 'ADMIN'), asyncHandler(getAssignmentAnalytics));
router.get('/quizzes', requireRole('TEACHER', 'ADMIN'), asyncHandler(getQuizAnalytics));
// Students may read only their own performance; staff only students of their organization.
router.get('/students', validate(studentPerformanceQuerySchema), asyncHandler(getStudentPerformance));
router.get('/teachers', requireRole('ADMIN'), asyncHandler(getTeacherPerformance));
router.get('/usage', requireRole('ADMIN'), asyncHandler(getUsageStats));
router.get('/ai-usage', requireRole('ADMIN'), asyncHandler(getAiUsage));

export default router;
