import { Router } from 'express';
import { 
  getDashboardStats, 
  getStudentStats, 
  getGroupStats, 
  triggerRecommendations 
} from '../controllers/analytics.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../security/role.middleware';
import { asyncHandler } from '../utils/async-handler';
import prisma from '../config/prisma';
import { requireRequestOrgId } from '../security/request-context';

const router = Router();

router.use(authenticate);

// Organization-level dashboard stats for the caller's tenant
router.get('/stats', asyncHandler(getDashboardStats));
// Students may read only their own stats; staff only students of their organization
router.get('/student/:studentId', asyncHandler(getStudentStats));
router.get('/group/:groupId', requireRole('TEACHER', 'ADMIN'), asyncHandler(getGroupStats));

// Classes (groups) of the caller's organization for analytics
router.get('/groups', requireRole('TEACHER', 'ADMIN'), asyncHandler(async (req, res) => {
  const orgId = requireRequestOrgId(req);
  const classes = await prisma.class.findMany({
    where: { organizationId: orgId },
    include: {
      _count: { select: { students: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  
  res.json({
    success: true,
    data: classes.map(c => ({
      id: c.id,
      name: `${c.grade}-${c.section} (${c.academicYear})`,
      subject: 'General',
      students: c._count.students,
    }))
  });
}));
// AI recommendations call a paid LLM; staff only, confined to their organization
router.post('/recommendations', requireRole('TEACHER', 'ADMIN'), asyncHandler(triggerRecommendations));

export default router;
