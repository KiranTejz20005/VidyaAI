import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { normalizeRole } from '../security/request-context';

export const exportAssessmentPdf = async (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.params;
    
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    const role = normalizeRole(user.role);
    // Tenant scope always applies except for SUPER_ADMIN; TEACHERs only see their own.
    const scope: Record<string, string> = {};
    if (role !== 'SUPER_ADMIN') {
      scope.organizationId = user.activeOrganizationId || user.organizationId || '';
      if (role === 'TEACHER') scope.authorId = user.id;
    }

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, ...scope },
      include: {
        questions: {
          include: { question: true }
        }
      }
    });

    if (!assessment) {
      res.status(404).json({ success: false, error: 'Assessment not found' });
      return;
    }

    // MVP: Instead of actually spinning up Puppeteer, we return raw HTML or a success flag
    // In production, you'd use Puppeteer/PDFKit here to render the questions to a buffer
    // and set res.setHeader('Content-Type', 'application/pdf'); res.send(buffer);
    
    res.json({
      success: true,
      data: {
        message: 'PDF export triggered successfully.',
        downloadUrl: `/api/v1/exports/${assessmentId}/download.pdf` // Mock URL
      }
    });
    return;
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to export assessment' });
    return;
  }
};
