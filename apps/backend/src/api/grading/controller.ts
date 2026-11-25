import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { sendSuccess, sendCreated, sendAccepted } from '../common/response';
import { ApiError } from '../common/errors';
import { parsePagination, buildPagination } from '../common/pagination';
import { getRequestUserId, requireRequestOrgId, orgScope, isStudentRole } from '../../security/request-context';
import { evaluateSubmission } from '../../services/grader.service';
import { AuditService } from '../../services/audit.service';
import {
  assertCanGradeAssignment as assertCanGradeAssignmentRaw,
  loadSubmissionScoped as loadSubmissionScopedRaw,
  AccessDeniedError,
  NotFoundError as AccessNotFoundError,
} from '../../security/assignment-access';
import prisma from '../../config/prisma';
import { serializeGradingConfig, serializeSubmission, serializeEvaluation, serializeBulkEvaluateJob } from './serializers';
import {
  BULK_ASSESSMENT_STATUS_PREFIX,
  getAssessmentQueue,
  mapBulkStatusForDto,
  parseBulkJobMeta,
  serializeBulkJobMeta,
} from '../../queues/assessment.queue';

/** Maps the access-layer errors onto API errors so they render as 403/404 instead of 500. */
async function withAccessErrors<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof AccessNotFoundError) throw ApiError.notFound(err.message);
    if (err instanceof AccessDeniedError) throw ApiError.forbidden(err.message);
    throw err;
  }
}

const assertCanGradeAssignment = (req: Request, assignmentId: string) =>
  withAccessErrors(assertCanGradeAssignmentRaw(req, assignmentId));

const loadSubmissionScoped = (req: Request, submissionId: string) =>
  withAccessErrors(loadSubmissionScopedRaw(req, submissionId));

export const saveGradingConfig = async (req: Request, res: Response): Promise<void> => {
  const log = (req as any).logger ?? undefined;
  try {
    const { assignmentId } = req.params;
    const userId = getRequestUserId(req);
    const orgId = requireRequestOrgId(req);

    await assertCanGradeAssignment(req, assignmentId);

    if (req.body.rubricId) {
      const rubric = await prisma.rubric.findFirst({
        where: { id: req.body.rubricId, ...orgScope(req) },
        select: { id: true },
      });
      if (!rubric) throw ApiError.notFound('Rubric not found');
    }

    const existing = await prisma.assignmentGradingConfig.findUnique({ where: { assignmentId } });
    let config: any;

    if (existing) {
      config = await (prisma as any).assignmentGradingConfig.update({
        where: { assignmentId },
        data: {
          answerKeyText: req.body.answerKeyText,
          rubricId: req.body.rubricId ?? null,
          aiModel: req.body.aiModel ?? null,
          passingScore: req.body.passingScore ?? null,
          maxAttempts: req.body.maxAttempts ?? null,
          gradingType: req.body.gradingType,
        },
      });
    } else {
      config = await (prisma as any).assignmentGradingConfig.create({
        data: {
          assignmentId,
          answerKeyText: req.body.answerKeyText,
          rubricId: req.body.rubricId ?? null,
          aiModel: req.body.aiModel ?? null,
          passingScore: req.body.passingScore ?? null,
          maxAttempts: req.body.maxAttempts ?? null,
          gradingType: req.body.gradingType,
          status: 'ACTIVE',
        },
      });
    }

    await AuditService.logAuditEvent({
      userId,
      organizationId: orgId,
      action: 'GRADING_CONFIG_SAVED',
      entity: 'GradingConfig',
      entityId: config.id,
      metadata: { assignmentId },
    });

    sendCreated(res, serializeGradingConfig(config));
  } catch (error: any) {
    (log ?? logger).error({ err: error, stack: error.stack, assignmentId: req.params.assignmentId }, '[saveGradingConfig]');
    throw error;
  }
};

export const getGradingConfig = async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.params;

  await assertCanGradeAssignment(req, assignmentId);

  const config = await prisma.assignmentGradingConfig.findUnique({
    where: { assignmentId },
    include: { rubric: { include: { criteria: true } } },
  });

  if (!config) {
    throw ApiError.notFound('Grading configuration not found for this assignment');
  }

  sendSuccess(res, { data: serializeGradingConfig(config) });
};

export const listSubmissionsForGrading = async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.params;
  const { page, limit, sort, order } = parsePagination(req);

  await assertCanGradeAssignment(req, assignmentId);

  const where = { assignmentId };
  const [submissions, total] = await Promise.all([
    prisma.studentSubmission.findMany({
      where,
      include: { student: { select: { name: true } } } as any,
      orderBy: { [sort]: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.studentSubmission.count({ where }),
  ]);

  sendSuccess(res, {
    data: submissions.map(serializeSubmission),
    pagination: buildPagination(page, limit, total),
  });
};

export const evaluateSubmissionById = async (req: Request, res: Response): Promise<void> => {
  const { submissionId } = req.params;
  const userId = getRequestUserId(req);
  const orgId = requireRequestOrgId(req);

  const submission = await loadSubmissionScoped(req, submissionId);
  if (!submission) throw ApiError.notFound('Submission not found');

  const result = await evaluateSubmission(submissionId);

  await AuditService.logAuditEvent({
    userId,
    organizationId: orgId,
    action: 'SUBMISSION_EVALUATED',
    entity: 'SubmissionEvaluation',
    entityId: submissionId,
    metadata: { assignmentId: submission.assignmentId },
  });

  sendSuccess(res, { data: serializeEvaluation(result) });
};

export const getEvaluationResult = async (req: Request, res: Response): Promise<void> => {
  const { submissionId } = req.params;

  const submission = await loadSubmissionScoped(req, submissionId);
  if (isStudentRole(req.user?.role) && submission.status !== 'RESULT_PUBLISHED') {
    throw ApiError.notFound('Evaluation not found for this submission');
  }

  const evaluation = await prisma.submissionEvaluation.findUnique({
    where: { submissionId },
  });

  if (!evaluation) {
    throw ApiError.notFound('Evaluation not found for this submission');
  }

  sendSuccess(res, { data: serializeEvaluation(evaluation) });
};

export const overrideGrade = async (req: Request, res: Response): Promise<void> => {
  const { submissionId } = req.params;
  const { score, reason, criteriaGrades } = req.body;
  const userId = getRequestUserId(req);
  const orgId = requireRequestOrgId(req);

  const submission = await loadSubmissionScoped(req, submissionId);

  const existingEvaluation = submission.evaluations?.[0];
  const assignment = await prisma.assignment.findUnique({
    where: { id: submission.assignmentId },
    select: { totalMarks: true },
  });
  const maxMarks = existingEvaluation && existingEvaluation.totalMarks > 0
    ? existingEvaluation.totalMarks
    : (assignment?.totalMarks ?? 0);
  if (!(maxMarks > 0)) {
    throw ApiError.badRequest('Cannot override a grade for an assignment without total marks');
  }
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > maxMarks) {
    throw ApiError.badRequest(`Score must be between 0 and ${maxMarks}`);
  }

  const beforeSnapshot = existingEvaluation
    ? {
        score: existingEvaluation.score,
        totalMarks: existingEvaluation.totalMarks,
        criteriaGrades: existingEvaluation.criteriaGrades,
        generalFeedback: existingEvaluation.generalFeedback,
        isOverridden: existingEvaluation.isOverridden,
      }
    : null;

  const evaluation = await (prisma as any).submissionEvaluation.upsert({
    where: { submissionId },
    create: {
      submissionId,
      score,
      totalMarks: maxMarks,
      generalFeedback: reason,
      criteriaGrades: criteriaGrades ?? [],
      isOverridden: true,
      overriddenBy: userId,
      overriddenAt: new Date(),
      overrideReason: reason,
    },
    update: {
      score,
      generalFeedback: reason,
      criteriaGrades: criteriaGrades ?? undefined,
      isOverridden: true,
      overriddenBy: userId,
      overriddenAt: new Date(),
      overrideReason: reason,
    },
  });

  // Immutable revision history — never silently overwrite prior marks without a trail
  try {
    await prisma.evaluationRevision.create({
      data: {
        evaluationId: evaluation.id,
        before: beforeSnapshot ?? { score: null },
        after: {
          score: evaluation.score,
          totalMarks: evaluation.totalMarks,
          criteriaGrades: evaluation.criteriaGrades,
          generalFeedback: evaluation.generalFeedback,
          isOverridden: true,
        },
        actorId: userId,
        reason: reason || 'Teacher grade override',
      },
    });
  } catch (revErr) {
    // Table may not exist until migration 0009 is applied — do not fail the override
    logger.warn({ err: revErr }, '[overrideGrade] EvaluationRevision create skipped');
  }

  await prisma.studentSubmission.update({
    where: { id: submissionId },
    data: { status: 'GRADED' },
  });

  await AuditService.logAuditEvent({
    userId,
    organizationId: orgId,
    action: 'GRADE_OVERRIDDEN',
    entity: 'SubmissionEvaluation',
    entityId: submissionId,
    metadata: { assignmentId: submission.assignmentId, reason },
  });

  sendSuccess(res, { data: serializeEvaluation(evaluation) });
};

export const bulkEvaluate = async (req: Request, res: Response): Promise<void> => {
  const { assignmentId } = req.params;
  const userId = getRequestUserId(req);
  const orgId = requireRequestOrgId(req);
  const force = req.body?.force === true;

  await assertCanGradeAssignment(req, assignmentId);

  const submissions = await prisma.studentSubmission.findMany({
    where: {
      assignmentId,
      organizationId: orgId,
      ...(force
        ? { status: { not: 'ARCHIVED' } }
        : { status: { notIn: ['GRADED', 'RESULT_PUBLISHED', 'ARCHIVED'] } }),
    },
    select: { id: true },
  });

  if (submissions.length === 0) {
    throw ApiError.badRequest('No submissions to evaluate');
  }

  const submissionIds = submissions.map((s) => s.id);
  const bulkMeta = {
    total: submissionIds.length,
    completed: 0,
    failed: 0,
    errors: [] as string[],
  };

  const job = await prisma.generationJob.create({
    data: {
      assignmentId,
      organizationId: orgId,
      status: `${BULK_ASSESSMENT_STATUS_PREFIX}queued`,
      progress: 0,
      progressVersion: 0,
      stageIndex: 0,
      error: serializeBulkJobMeta(bulkMeta),
      startedAt: new Date(),
    },
  });

  const bullmqJobId = `bulk-assessment-${job.id}`;
  const queue = getAssessmentQueue();

  try {
    await queue.add(
      'bulk-assessment-coordinator',
      {
        kind: 'coordinator',
        jobRecordId: job.id,
        assignmentId,
        organizationId: orgId,
        submissionIds,
        force,
      },
      { jobId: bullmqJobId, attempts: 2 }
    );
  } catch (err) {
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: `${BULK_ASSESSMENT_STATUS_PREFIX}failed`,
        completedAt: new Date(),
        error: serializeBulkJobMeta({
          ...bulkMeta,
          failed: bulkMeta.total,
          errors: ['Failed to enqueue bulk evaluation job'],
        }),
      },
    });
    throw ApiError.internal('Failed to start bulk evaluation job');
  }

  await prisma.generationJob.update({
    where: { id: job.id },
    data: { bullmqJobId },
  });

  await AuditService.logAuditEvent({
    userId,
    organizationId: orgId,
    action: 'BULK_EVALUATION_STARTED',
    entity: 'Assignment',
    entityId: assignmentId,
    metadata: { submissionCount: submissions.length, jobId: job.id, force },
  });

  sendAccepted(res, { jobId: job.id, submissionCount: submissions.length });
};

export const getBulkEvaluateJobStatus = async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;

  const job = await prisma.generationJob.findFirst({
    where: { id: jobId, assignment: { ...orgScope(req) } },
  });

  if (!job || !job.status.startsWith(BULK_ASSESSMENT_STATUS_PREFIX)) {
    throw ApiError.notFound('Bulk evaluation job not found');
  }

  const meta = parseBulkJobMeta(job.error);
  sendSuccess(res, {
    data: serializeBulkEvaluateJob({
      ...job,
      status: mapBulkStatusForDto(job.status),
      progress: job.progress ?? 0,
      total: meta?.total ?? 0,
      completed: meta?.completed ?? 0,
      failed: meta?.failed ?? 0,
      errors: meta?.errors.length ? meta.errors : undefined,
    }),
  });
};
