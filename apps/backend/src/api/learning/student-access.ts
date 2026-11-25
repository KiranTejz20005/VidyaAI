import type { Request } from 'express';
import prisma from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../common/errors';
import {
  getRequestOrgId,
  getRequestUserId,
  isAdminRole,
  isFacultyRole,
  isStudentRole,
  isSuperAdmin,
} from '../../security/request-context';

/**
 * Authorizes access to one student's learning and performance data.
 *
 * `studentId` is either a User id (submissions, analytics) or a roster
 * `Student` id (learning profiles and study plans).
 * - STUDENT: only themselves — their own user id, or a roster row that carries
 *   their e-mail inside their organization.
 * - TEACHER / ADMIN: only students that belong to the caller's organization.
 * - SUPER_ADMIN: any student of the selected organization, or any student when
 *   no organization is selected.
 *
 * Cross-tenant ids resolve to 404 so the existence of a student in another
 * organization is never confirmed.
 */
export async function assertStudentAccess(req: Request, studentId: string): Promise<void> {
  const callerId = getRequestUserId(req);
  const role = req.user?.role;
  const orgId = getRequestOrgId(req);

  if (isSuperAdmin(role) && !orgId) return;

  if (isStudentRole(role)) {
    if (studentId === callerId) return;
    const email = req.user?.email;
    if (email && orgId) {
      const ownRosterRow = await prisma.student.findFirst({
        where: { id: studentId, email: { equals: email, mode: 'insensitive' }, group: { organizationId: orgId } },
        select: { id: true },
      });
      if (ownRosterRow) return;
    }
    throw new ForbiddenError('You can only access your own learning data');
  }

  if (!(isAdminRole(role) || isFacultyRole(role))) {
    throw new ForbiddenError('Insufficient role for this action');
  }
  if (!orgId) throw new ForbiddenError('Organization scope required', 'ORG_SCOPE_REQUIRED');

  const [studentUser, rosterStudent] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, organizationId: orgId, role: 'STUDENT' },
      select: { id: true },
    }),
    prisma.student.findFirst({
      where: { id: studentId, group: { organizationId: orgId } },
      select: { id: true },
    }),
  ]);

  if (!studentUser && !rosterStudent) throw new NotFoundError('Student not found');
}
