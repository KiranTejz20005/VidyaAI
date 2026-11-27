import { Router } from 'express';
import { exportAssessmentPdf } from '../controllers/export.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Staff only; the controller additionally scopes by organization / author
router.get('/:assessmentId/pdf', authorize(['TEACHER', 'ADMIN', 'SUPER_ADMIN']), exportAssessmentPdf);

export default router;
