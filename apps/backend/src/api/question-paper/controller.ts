import { Request, Response } from 'express';
import { sendSuccess, sendAccepted, sendNoContent } from '../common/response';
import { ApiError } from '../common/errors';
import { parsePagination, buildPagination } from '../common/pagination';
// Called by question-paper/routes list/get/delete/archive. Reads GeneratedPaper + Assignment.
// Phase 3 plan: owner-scope teachers; student enrollment. User: implement Phase 3 plan.
import {
  getRequestUserId,
  requireRequestOrgId,
  orgScope,
  isStudentRole,
  isAdminRole,
  isSuperAdmin,
} from '../../security/request-context';
import { createAssignment, enqueueGeneration } from '../../services/assignment.service';
import { buildCanonicalGenerationState } from '../../services/canonical-metadata.service';
import { getGenerationQueue } from '../../queues/generation.queue';
import { assertStudentCanViewAssignment } from '../../security/assignment-access';
import prisma from '../../config/prisma';
import { serializeGeneratedPaper, serializeGenerationJob, serializeAnswerKey } from './serializers';

/** Assignment states in which a paper is released to students. */
const STUDENT_VISIBLE_ASSIGNMENT_STATUSES = new Set(['PUBLISHED', 'ACTIVE', 'COMPLETED']);

/** Teachers: own assignments only; admins: whole org. */
function paperListScope(req: Request): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: requireRequestOrgId(req) };
  if (!isAdminRole(req.user?.role) && !isSuperAdmin(req.user?.role)) {
    where.assignment = { createdById: getRequestUserId(req) };
  }
  return where;
}

async function loadPaperForRequest(req: Request, id: string) {
  const teacherOwnerScope =
    !isAdminRole(req.user?.role) && !isSuperAdmin(req.user?.role) && !isStudentRole(req.user?.role)
      ? { assignment: { createdById: getRequestUserId(req) } }
      : {};
  const paper = await prisma.generatedPaper.findFirst({
    where: { id, ...orgScope(req), ...teacherOwnerScope },
    include: {
      assignment: {
        select: { id: true, status: true, organizationId: true, createdById: true, classId: true },
      },
    },
  });
  if (!paper) throw ApiError.notFound('Paper not found');
  if (isStudentRole(req.user?.role)) {
    if (!STUDENT_VISIBLE_ASSIGNMENT_STATUSES.has(paper.assignment.status)) {
      throw ApiError.notFound('Paper not found');
    }
    try {
      await assertStudentCanViewAssignment(req, paper.assignment as any);
    } catch {
      throw ApiError.notFound('Paper not found');
    }
  }
  return paper;
}

/** Removes answers from a serialized paper so it can be shown to students. */
function stripAnswers<T extends { sections: Array<{ questions: Array<{ answer?: unknown }> }> }>(dto: T): T {
  return {
    ...dto,
    sections: dto.sections.map((section) => ({
      ...section,
      questions: section.questions.map(({ answer: _answer, ...question }) => question),
    })),
  };
}

export const generatePaper = async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const orgId = requireRequestOrgId(req);

  const { assignmentId } = req.body;

  let assignment: any;

  if (assignmentId) {
    assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, organizationId: orgId },
    });
    if (!assignment) throw ApiError.notFound('Assignment not found');
  } else {
    assignment = await createAssignment(req.body, [], orgId, userId, req.body.classId ?? null);
  }

  const result = await enqueueGeneration(assignment.id, userId, orgId);

  const job = await prisma.generationJob.findUnique({ where: { id: result.jobRecordId } });
  const canonicalState = buildCanonicalGenerationState({
    assignment,
    paper: null,
    job,
  });

  sendAccepted(res, {
    jobId: result.jobId,
    jobRecordId: result.jobRecordId,
    assignmentId: assignment.id,
    canonicalState,
  });
};

export const checkGenerationJob = async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;

  const queue = getGenerationQueue();
  const bullJob = await queue.getJob(jobId);

  if (!bullJob) {
    throw ApiError.notFound('Generation job not found');
  }

  const jobAssignmentId = bullJob.data?.assignmentId;
  const ownedAssignment = jobAssignmentId
    ? await prisma.assignment.findFirst({ where: { id: jobAssignmentId, ...orgScope(req) }, select: { id: true } })
    : null;
  if (!ownedAssignment) {
    throw ApiError.notFound('Generation job not found');
  }

  const state = await bullJob.getState();
  const progress = bullJob.progress;
  const returnvalue = bullJob.returnvalue;
  const failedReason = bullJob.failedReason;

  sendSuccess(res, {
    data: serializeGenerationJob(
      {
        assignmentId: bullJob.data.assignmentId,
        status: state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'processing',
        progress: typeof progress === 'number' ? progress : 0,
        stage: state,
        generationSeq: 0,
        error: failedReason ?? undefined,
        resultUrl: returnvalue?.paperId ? `/api/v1/question-paper/${returnvalue.paperId}` : undefined,
        createdAt: new Date(bullJob.timestamp),
      },
      jobId
    ),
  });
};

export const listPapers = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sort, order } = parsePagination(req);
  const { status } = req.query as Record<string, string | undefined>;

  const where: any = { ...paperListScope(req) };
  if (status) where.status = status;

  const [papers, total] = await Promise.all([
    prisma.generatedPaper.findMany({
      where,
      orderBy: { [sort]: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.generatedPaper.count({ where }),
  ]);

  sendSuccess(res, {
    data: papers.map(serializeGeneratedPaper),
    pagination: buildPagination(page, limit, total),
  });
};

export const getPaperById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const paper = await loadPaperForRequest(req, id);

  const dto = serializeGeneratedPaper(paper);
  sendSuccess(res, { data: isStudentRole(req.user?.role) ? stripAnswers(dto) : dto });
};

export const deletePaper = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const existing = await prisma.generatedPaper.findFirst({
    where: { id, ...paperListScope(req) },
  });
  if (!existing) throw ApiError.notFound('Paper not found');

  await prisma.generatedPaper.delete({ where: { id } });

  sendNoContent(res);
};

export const publishPaper = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const existing = await prisma.generatedPaper.findFirst({
    where: { id, ...paperListScope(req) },
  });
  if (!existing) throw ApiError.notFound('Paper not found');

  const updated = await (prisma as any).generatedPaper.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });

  sendSuccess(res, { data: serializeGeneratedPaper(updated as any) });
};

export const archivePaper = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const existing = await prisma.generatedPaper.findFirst({
    where: { id, ...paperListScope(req) },
  });
  if (!existing) throw ApiError.notFound('Paper not found');

  const updated = await (prisma as any).generatedPaper.update({
    where: { id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });

  sendSuccess(res, { data: serializeGeneratedPaper(updated) });
};

export const getPaperDownloadUrl = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const paper = await loadPaperForRequest(req, id);

  if (!paper.pdfUrl && !paper.pdfPath) {
    throw ApiError.notFound('PDF not available for this paper');
  }

  let downloadUrl = paper.pdfUrl;
  const storageKey = paper.pdfPath || paper.pdfUrl;
  if (storageKey) {
    try {
      const { getR2Storage } = await import('../../services/storage/r2-storage');
      downloadUrl = await getR2Storage().getSignedDownloadUrl(storageKey);
    } catch {
      downloadUrl = paper.pdfUrl;
    }
  }

  sendSuccess(res, { data: { id: paper.id, pdfUrl: downloadUrl } });
};

export const getAnswerKey = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (isStudentRole(req.user?.role)) throw ApiError.forbidden('Answer keys are only available to staff');

  const paper = await loadPaperForRequest(req, id);

  sendSuccess(res, { data: serializeAnswerKey(paper) });
};
