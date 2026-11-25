import type { Request } from 'express';
import type { Assignment } from '@prisma/client';
import prisma from '../config/prisma';
import {
  getRequestOrgId,
  getRequestUserId,
  isAdminRole,
  isFacultyRole,
  isStudentRole,
  isSuperAdmin,
  normalizeRole,
} from './request-context';

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

const PUBLISHED_STATUSES = new Set(['PUBLISHED', 'ACTIVE', 'COMPLETED', 'APPROVED']);

export async function loadAssignmentScoped(
  assignmentId: string,
  organizationId?: string,
): Promise<Assignment | null> {
  const where: { id: string; organizationId?: string } = { id: assignmentId };
  if (organizationId) where.organizationId = organizationId;
  return prisma.assignment.findFirst({ where });
}

export async function loadAssignmentForRequest(req: Request, assignmentId: string): Promise<Assignment> {
  // Only a SUPER_ADMIN may act across tenants. Org ADMINs are confined to
  // their own organization like everyone else. A miss is always a 404 so the
  // response does not reveal whether the id exists in another tenant.
  const bypassOrgScope = isSuperAdmin(req.user?.role) && !getRequestOrgId(req);
  const orgId = bypassOrgScope ? undefined : getRequestOrgId(req);
  if (!bypassOrgScope && !orgId) throw new NotFoundError('Assignment not found');
  const assignment = await loadAssignmentScoped(assignmentId, orgId);
  if (!assignment) throw new NotFoundError('Assignment not found');
  return assignment;
}

export function assertFacultyOwnsAssignment(req: Request, assignment: Assignment): void {
  if (isAdminRole(req.user?.role) || isSuperAdmin(req.user?.role)) return;
  if (!isFacultyRole(req.user?.role)) {
    throw new AccessDeniedError('Faculty access required');
  }
  const createdById = (assignment as Assignment & { createdById?: string | null }).createdById;
  if (createdById && createdById !== getRequestUserId(req)) {
    throw new AccessDeniedError('You can only modify assignments you created');
  }
}

export async function assertStudentEnrolledInOrg(studentId: string, organizationId: string): Promise<boolean> {
  if (!organizationId) return false;
  const user = await prisma.user.findUnique({ where: { id: studentId }, select: { organizationId: true, activeOrganizationId: true } });
  if (user?.organizationId === organizationId || user?.activeOrganizationId === organizationId) return true;

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId,
      section: { classroom: { organizationId } },
    },
  });
  return Boolean(enrollment);
}

export async function assertStudentCanViewAssignment(req: Request, assignment: Assignment): Promise<void> {
  if (!isStudentRole(req.user?.role)) return;
  if (!PUBLISHED_STATUSES.has(assignment.status)) {
    throw new AccessDeniedError('Assignment is not published');
  }
  const enrolled = await assertStudentEnrolledInOrg(getRequestUserId(req), assignment.organizationId);
  if (!enrolled) {
    throw new AccessDeniedError('You are not enrolled in this organization');
  }
}

export async function assertCanViewAssignment(req: Request, assignment: Assignment): Promise<void> {
  const role = normalizeRole(req.user?.role);
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TEACHER') return;
  if (role === 'STUDENT') {
    await assertStudentCanViewAssignment(req, assignment);
    return;
  }
  throw new AccessDeniedError('Insufficient permissions to view assignment');
}

export async function assertCanViewPaper(req: Request, assignmentId: string): Promise<Assignment> {
  const assignment = await loadAssignmentForRequest(req, assignmentId);
  await assertCanViewAssignment(req, assignment);
  return assignment;
}

export async function assertCanMutatePaper(req: Request, assignmentId: string): Promise<Assignment> {
  const assignment = await loadAssignmentForRequest(req, assignmentId);
  if (isAdminRole(req.user?.role) || isSuperAdmin(req.user?.role)) return assignment;
  if (!isFacultyRole(req.user?.role)) {
    throw new AccessDeniedError('Insufficient permissions to edit paper');
  }
  assertFacultyOwnsAssignment(req, assignment);
  return assignment;
}

export async function assertCanGradeAssignment(req: Request, assignmentId: string): Promise<Assignment> {
  const assignment = await loadAssignmentForRequest(req, assignmentId);
  if (isAdminRole(req.user?.role) || isSuperAdmin(req.user?.role)) return assignment;
  if (!isFacultyRole(req.user?.role)) {
    throw new AccessDeniedError('Insufficient permissions to grade this assignment');
  }
  return assignment;
}

export async function loadSubmissionScoped(req: Request, submissionId: string) {
  const orgId = getRequestOrgId(req);
  const submission = await prisma.studentSubmission.findUnique({
    where: { id: submissionId },
    include: { evaluations: true },
  });
  if (!submission) throw new NotFoundError('Submission not found');

  if (orgId && submission.organizationId !== orgId && !isSuperAdmin(req.user?.role)) {
    throw new AccessDeniedError('Submission belongs to another organization');
  }

  if (isStudentRole(req.user?.role) && submission.studentId !== getRequestUserId(req)) {
    throw new AccessDeniedError('You cannot access another student\'s submission');
  }

  if (isFacultyRole(req.user?.role)) {
    await assertCanGradeAssignment(req, submission.assignmentId);
  }

  return submission;
}

export function assignmentListFilter(req: Request): { organizationId?: string; createdById?: string } {
  const orgId = getRequestOrgId(req);
  const filter: { organizationId?: string; createdById?: string } = {};
  if (orgId) filter.organizationId = orgId;
  if (isFacultyRole(req.user?.role) && req.authScope?.requireOwnership) {
    filter.createdById = getRequestUserId(req);
  }
  return filter;
}

export function handleAccessError(res: import('express').Response, err: unknown): boolean {
  if (err instanceof AccessDeniedError) {
    res.status(403).json({ success: false, code: 'FORBIDDEN', error: err.message });
    return true;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ success: false, error: err.message });
    return true;
  }
  return false;
}
