import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middlewares/auth.middleware';
import { requirePermission } from '../security/access-control';
import { PERMISSIONS } from '../security/permissions';
import { 
  generateWorksheet, 
  getSheets, 
  getSheet,
  removeSheet
} from '../controllers/worksheets.controller';

const router = Router();

router.use(authenticate);

router.post('/', requirePermission(PERMISSIONS.MANAGE_SYLLABUS), asyncHandler(generateWorksheet));
router.get('/', asyncHandler(getSheets));
router.get('/:id', asyncHandler(getSheet));
router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_SYLLABUS), asyncHandler(removeSheet));

export default router;
