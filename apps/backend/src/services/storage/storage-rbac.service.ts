import prisma from '../../config/prisma';
import { logger } from '../../utils/logger';
import { normalizeRole } from '../../security/request-context';

export type StorageAction =
  | 'file:read'
  | 'file:create'
  | 'file:update'
  | 'file:delete'
  | 'file:moderate';

export interface StorageUserContext {
  id: string;
  role: string;
  organizationId?: string | null;
  email?: string | null;
}

export interface StoredFileRecord {
  id: string;
  key: string;
  scope: string;
  ownerId: string;
  organizationId?: string | null;
  entityId?: string | null;
  isPublic?: boolean;
}

/** Sentinel the auth middleware assigns to accounts without an organization. */
const NO_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

const PUBLISHED_ASSIGNMENT_STATUSES = ['PUBLISHED', 'ACTIVE', 'COMPLETED', 'APPROVED'] as const;

/** Scopes whose entityId is a user id (a personal folder). */
const USER_FOLDER_SCOPES = new Set(['students', 'teachers', 'admins', 'documents', 'knowledge', 'uploads']);

/** Returns the caller's real tenant id, or null for missing/sentinel values. */
export function effectiveOrgId(orgId: string | null | undefined): string | null {
  if (!orgId || orgId === NO_ORGANIZATION_ID) return null;
  return orgId;
}

export class StorageRbacService {
  /**
   * Evaluates whether a user can perform an action on a target file.
   * Order matters: ownership, then the tenant boundary (fail closed when either
   * side has no organization), and only then public/role-based grants — so a
   * public flag can never cross tenants.
   */
  static async canAccessFile(
    user: StorageUserContext,
    action: StorageAction,
    file: StoredFileRecord
  ): Promise<boolean> {
    if (!user || !user.id) return false;
    const role = normalizeRole(user.role);

    // 1. SUPER_ADMIN has platform-wide access.
    if (role === 'SUPER_ADMIN') return true;

    // 2. Owners always manage their own files.
    if (file.ownerId === user.id) return true;

    // 3. Tenant boundary.
    const userOrg = effectiveOrgId(user.organizationId);
    const fileOrg = effectiveOrgId(file.organizationId);
    if (!userOrg || !fileOrg || userOrg !== fileOrg) {
      logger.warn({
        userId: user.id,
        userOrg: user.organizationId,
        fileOrg: file.organizationId,
        fileId: file.id,
      }, '[StorageRBAC] Cross-tenant access denied');
      return false;
    }

    // 4. Public files are readable by members of the same organization.
    if (action === 'file:read' && file.isPublic) return true;

    // 5. Org admins manage all files of their organization.
    if (role === 'ADMIN') return true;

    const scope = file.scope.toLowerCase();

    // 6. Teachers read shared material and submissions to their own assignments.
    if (role === 'TEACHER') {
      if (action !== 'file:read') return false;
      if (['courses', 'syllabus', 'assignments', 'blogs', 'documents'].includes(scope)) return true;
      if (scope === 'students' && file.entityId) {
        const assignment = await prisma.assignment.findFirst({
          where: { id: file.entityId, createdById: user.id, organizationId: userOrg },
          select: { id: true },
        });
        return Boolean(assignment);
      }
      return false;
    }

    // 7. Students read published course material and files of assignments for their class.
    if (role === 'STUDENT') {
      if (action !== 'file:read') return false;
      if (['syllabus', 'courses', 'blogs'].includes(scope)) return true;
      if (scope === 'assignments' && file.entityId) {
        return StorageRbacService.studentCanReadAssignment(user, file.entityId, userOrg);
      }
      return false;
    }

    return false;
  }

  /**
   * A student may read an assignment's files only when the assignment is
   * published in their organization and is either org-wide (no class) or
   * assigned to a class the student is on the roster of.
   */
  private static async studentCanReadAssignment(
    user: StorageUserContext,
    assignmentId: string,
    orgId: string
  ): Promise<boolean> {
    let email = user.email ?? null;
    if (!email) {
      const dbUser = await prisma.user.findFirst({
        where: { id: user.id, organizationId: orgId },
        select: { email: true },
      });
      email = dbUser?.email ?? null;
    }
    if (!email) return false;

    const assignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        organizationId: orgId,
        status: { in: [...PUBLISHED_ASSIGNMENT_STATUSES] },
        OR: [
          { classId: null },
          { class: { students: { some: { email, isActive: true } } } },
        ],
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }

  /** Only staff may publish a file to the rest of their organization. */
  static canMarkPublic(user: StorageUserContext): boolean {
    const role = normalizeRole(user?.role);
    return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TEACHER';
  }

  /**
   * Role/scope gate for uploads (no I/O). Pair it with canUploadToEntity,
   * which verifies the target entity against the database.
   */
  static canUploadToScope(
    user: StorageUserContext,
    scope: string,
    entityId: string
  ): boolean {
    if (!user || !user.id) return false;
    const role = normalizeRole(user.role);
    const normalizedScope = (scope || '').toLowerCase();

    if (role === 'SUPER_ADMIN') return true;

    // Every other role must belong to an organization.
    if (!effectiveOrgId(user.organizationId)) return false;

    if (role === 'ADMIN') return true;

    if (role === 'TEACHER') {
      const allowedScopes = ['teachers', 'syllabus', 'courses', 'assignments', 'blogs', 'documents', 'question-papers', 'lesson-plans'];
      if (!allowedScopes.includes(normalizedScope)) return false;
      if (USER_FOLDER_SCOPES.has(normalizedScope) && entityId !== user.id) return false;
      return true;
    }

    if (role === 'STUDENT') {
      const allowedScopes = ['students', 'documents'];
      if (!allowedScopes.includes(normalizedScope)) return false;
      return entityId === user.id;
    }

    return false;
  }

  /**
   * Verifies that `entityId` names an existing entity of `scope` inside the
   * caller's organization. Personal folders must be the caller's own id unless
   * the caller is an org admin, who may target any user of the organization.
   */
  static async canUploadToEntity(
    user: StorageUserContext,
    scope: string,
    entityId: string
  ): Promise<boolean> {
    if (!user || !user.id || !entityId) return false;
    const role = normalizeRole(user.role);
    if (role === 'SUPER_ADMIN') return true;

    const orgId = effectiveOrgId(user.organizationId);
    if (!orgId) return false;
    const normalizedScope = (scope || '').toLowerCase();

    try {
      if (USER_FOLDER_SCOPES.has(normalizedScope)) {
        if (entityId === user.id) return true;
        if (role !== 'ADMIN') return false;
        const target = await prisma.user.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
        return Boolean(target);
      }

      switch (normalizedScope) {
        case 'assignments':
        case 'question-papers': {
          const assignment = await prisma.assignment.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
          return Boolean(assignment);
        }
        case 'syllabus': {
          const syllabus = await prisma.syllabus.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
          if (syllabus) return true;
          const course = await prisma.course.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
          return Boolean(course);
        }
        case 'courses': {
          const course = await prisma.course.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
          return Boolean(course);
        }
        case 'lesson-plans': {
          const plan = await prisma.lessonPlan.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
          return Boolean(plan);
        }
        case 'quizzes': {
          const quiz = await prisma.quizSession.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
          return Boolean(quiz);
        }
        case 'blogs': {
          const post = await prisma.communityPost.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
          return Boolean(post);
        }
        case 'evaluations': {
          const submission = await prisma.studentSubmission.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } });
          return Boolean(submission);
        }
        default:
          return false;
      }
    } catch (err) {
      logger.warn({ err, scope: normalizedScope }, '[StorageRBAC] Upload target lookup failed');
      return false;
    }
  }
}
