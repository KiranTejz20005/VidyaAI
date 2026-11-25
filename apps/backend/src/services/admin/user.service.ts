import type { Prisma, SystemRole, User } from '@prisma/client';
import prisma from '../../config/prisma';
import { generateAccessToken, hashPassword, revokeAllUserSessions } from '../auth.service';
import { generateTemporaryPassword, toSafeUser, validatePasswordPolicy } from '../../security/credentials';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../api/common/errors';
import type { AdminActor } from './admin-scope';

/** User columns that may leave the API (no credential material). */
export const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  avatar: true,
  status: true,
  authProvider: true,
  organizationId: true,
  activeOrganizationId: true,
  departmentId: true,
  preferences: true,
  forcePasswordReset: true,
  hasCompletedOnboarding: true,
  onboardingCompletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const ROLE_ALIASES: Record<string, SystemRole> = {
  STUDENT: 'STUDENT',
  TEACHER: 'TEACHER',
  FACULTY: 'TEACHER',
  ADMIN: 'ADMIN',
  ORG_ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
};

/** Statuses an administrator may set directly. DELETED is reserved for deleteUser. */
export const ADMIN_SETTABLE_USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;

/** Maps client role strings (including FACULTY / ORG_ADMIN aliases) to a SystemRole. */
export function parseSystemRole(input: unknown): SystemRole {
  const role = typeof input === 'string' ? ROLE_ALIASES[input.trim().toUpperCase()] : undefined;
  if (!role) throw new ValidationError('Invalid role');
  return role;
}

/**
 * Resolves a requested role and enforces who may grant it: SUPER_ADMIN only by
 * a SUPER_ADMIN; ADMIN only by a SUPER_ADMIN when `allowOrgAdmin` is false.
 */
export function resolveAssignableRole(
  actor: Pick<AdminActor, 'isSuperAdmin'>,
  input: unknown,
  options: { allowOrgAdmin?: boolean } = {},
): SystemRole {
  const role = parseSystemRole(input);
  if (role === 'SUPER_ADMIN' && !actor.isSuperAdmin) {
    throw new ForbiddenError('Only a SUPER_ADMIN can assign the SUPER_ADMIN role');
  }
  if (role === 'ADMIN' && !actor.isSuperAdmin && options.allowOrgAdmin === false) {
    throw new ForbiddenError('Only a SUPER_ADMIN can assign the ADMIN role');
  }
  return role;
}

/**
 * Organization a new user is created in. Non-super callers always create in
 * their own tenant; only a SUPER_ADMIN may target another organization.
 */
export function resolveTargetOrganization(
  actor: AdminActor,
  role: SystemRole,
  requestedOrgId?: string | null,
): string | null {
  if (role === 'SUPER_ADMIN') return null;
  if (actor.isSuperAdmin) {
    const orgId = requestedOrgId || actor.organizationId;
    if (!orgId) throw new ValidationError('organizationId is required for this role');
    return orgId;
  }
  if (requestedOrgId && requestedOrgId !== actor.organizationId) {
    throw new ForbiddenError('Cannot create users in another organization');
  }
  if (!actor.organizationId) throw new ForbiddenError('Organization scope required', 'ORG_SCOPE_REQUIRED');
  return actor.organizationId;
}

export function assertNotSelf(actor: Pick<AdminActor, 'id'>, targetId: string, action = 'perform this action on'): void {
  if (actor.id === targetId) throw new ForbiddenError(`You cannot ${action} your own account`);
}

/** Validates an admin-supplied password, or generates a one-time password when none is given. */
export function resolveInitialPassword(supplied: unknown): { password: string; generated: boolean } {
  if (supplied === undefined || supplied === null || supplied === '') {
    return { password: generateTemporaryPassword(), generated: true };
  }
  const policyError = validatePasswordPolicy(supplied);
  if (policyError) throw new ValidationError(policyError);
  return { password: supplied as string, generated: false };
}

export async function assertDepartmentInOrganization(departmentId: string, organizationId: string | null): Promise<void> {
  if (!organizationId) throw new ValidationError('Invalid department');
  const dept = await prisma.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } });
  if (!dept) throw new ValidationError('Invalid department');
}

async function assertEmailAvailable(email: string, exceptUserId?: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== exceptUserId) {
    throw new ConflictError('User with this email already exists.');
  }
}

async function syncUserRole(userId: string, role: SystemRole): Promise<void> {
  const roleRecord = await prisma.role.findUnique({ where: { name: role } });
  if (!roleRecord) return;
  await prisma.userRole.deleteMany({ where: { userId } });
  await prisma.userRole.create({ data: { userId, roleId: roleRecord.id } });
}

export interface CreateUserInput {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  role: SystemRole;
  phone?: string | null;
  organizationId: string | null;
  departmentId?: string | null;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  role?: string;
  organizationId?: string | null;
  departmentId?: string | null;
  status?: string;
}

export class UserService {
  /**
   * Creates a user. Role and organization must already be authorized by the
   * caller (see resolveAssignableRole / resolveTargetOrganization). When no
   * password is supplied a one-time password is generated and returned once.
   */
  static async createUser(data: CreateUserInput): Promise<{ user: Omit<User, 'passwordHash' | 'googleId'>; tempPassword: string | null }> {
    const { password, generated } = resolveInitialPassword(data.password);
    const email = data.email.trim().toLowerCase();
    await assertEmailAvailable(email);
    if (data.departmentId) await assertDepartmentInOrganization(data.departmentId, data.organizationId);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        phone: data.phone || null,
        organizationId: data.organizationId,
        departmentId: data.departmentId || null,
        forcePasswordReset: true,
      },
    });

    await syncUserRole(user.id, data.role);

    return { user: toSafeUser(user), tempPassword: generated ? password : null };
  }

  static async getUsers(organizationId: string | undefined, window: { skip: number; take: number }) {
    return prisma.user.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: { not: 'DELETED' },
      },
      orderBy: { createdAt: 'desc' },
      skip: window.skip,
      take: window.take,
      select: {
        ...SAFE_USER_SELECT,
        organization: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
  }

  /**
   * Loads a user the actor may administer. Non-super callers only reach users
   * of their own organization (404 otherwise) and can never touch a SUPER_ADMIN.
   */
  static async findManageableUser(actor: AdminActor, id: string, options: { roles?: SystemRole[] } = {}): Promise<User> {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.status === 'DELETED') throw new NotFoundError('User not found');
    if (!actor.isSuperAdmin) {
      if (!actor.organizationId || target.organizationId !== actor.organizationId) {
        throw new NotFoundError('User not found');
      }
      if (target.role === 'SUPER_ADMIN') {
        throw new ForbiddenError('Access denied: Cannot modify SUPER_ADMIN users.');
      }
    }
    if (options.roles && !options.roles.includes(target.role)) throw new NotFoundError('User not found');
    return target;
  }

  /** Applies an allowlisted update on behalf of `actor`. */
  static async updateUser(actor: AdminActor, id: string, input: UpdateUserInput) {
    const target = await UserService.findManageableUser(actor, id);
    const data: Prisma.UserUncheckedUpdateInput = {};
    let revokeSessions = false;

    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.phone !== undefined) data.phone = input.phone || null;

    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      if (email !== target.email) {
        await assertEmailAvailable(email, target.id);
        data.email = email;
      }
    }

    let nextRole: SystemRole = target.role;
    if (input.role !== undefined) {
      const role = resolveAssignableRole(actor, input.role);
      if (role !== target.role) {
        assertNotSelf(actor, target.id, 'change the role of');
        data.role = role;
        nextRole = role;
        revokeSessions = true;
      }
    }

    let nextOrgId = target.organizationId;
    if (input.organizationId !== undefined && input.organizationId !== target.organizationId) {
      if (!actor.isSuperAdmin) throw new ForbiddenError('Only a SUPER_ADMIN can move users between organizations');
      if (input.organizationId) {
        const org = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { id: true } });
        if (!org) throw new NotFoundError('Organization not found');
      }
      data.organizationId = input.organizationId;
      data.activeOrganizationId = null;
      nextOrgId = input.organizationId;
      revokeSessions = true;
    }
    if (nextRole !== 'SUPER_ADMIN' && !nextOrgId) {
      throw new ValidationError('organizationId is required for this role');
    }

    if (input.departmentId !== undefined) {
      if (input.departmentId) await assertDepartmentInOrganization(input.departmentId, nextOrgId);
      data.departmentId = input.departmentId || null;
    } else if (data.organizationId !== undefined) {
      data.departmentId = null;
    }

    if (input.status !== undefined && input.status !== target.status) {
      if (!(ADMIN_SETTABLE_USER_STATUSES as readonly string[]).includes(input.status)) {
        throw new ValidationError('Invalid status');
      }
      if (input.status !== 'ACTIVE') {
        assertNotSelf(actor, target.id, 'deactivate');
        revokeSessions = true;
      }
      data.status = input.status;
    }

    await prisma.user.update({ where: { id: target.id }, data });
    if (data.role) await syncUserRole(target.id, nextRole);
    if (revokeSessions) await revokeAllUserSessions(target.id);

    return prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      select: {
        ...SAFE_USER_SELECT,
        organization: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
  }

  static async suspendUser(id: string, suspend: boolean = true) {
    const user = await prisma.user.update({
      where: { id },
      data: { status: suspend ? 'SUSPENDED' : 'ACTIVE' },
      select: SAFE_USER_SELECT,
    });
    if (suspend) await revokeAllUserSessions(id);
    return user;
  }

  static async deleteUser(id: string) {
    // Soft delete to avoid breaking database relations immediately
    const user = await prisma.user.update({
      where: { id },
      data: { status: 'DELETED' },
      select: SAFE_USER_SELECT,
    });
    await revokeAllUserSessions(id);
    return user;
  }

  /**
   * Sets a new password (validated against policy) or a generated one-time
   * password, forces a change at next login and signs the user out everywhere.
   */
  static async resetPassword(id: string, newPassword?: unknown) {
    const { password, generated } = resolveInitialPassword(newPassword);
    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(password),
        forcePasswordReset: true,
      },
      select: SAFE_USER_SELECT,
    });
    await revokeAllUserSessions(id);
    return { user, tempPassword: generated ? password : null };
  }

  static async impersonateUser(adminId: string, targetUserId: string) {
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Unauthorized impersonation.');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { organization: true, department: true },
    });

    if (!targetUser) {
      throw new NotFoundError('Target user not found.');
    }

    // Generate accessToken for target user
    const token = generateAccessToken({
      userId: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      organizationId: targetUser.organizationId,
      departmentId: targetUser.departmentId,
    });

    // Log the impersonation action
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: `IMPERSONATE_USER`,
        ipAddress: '0.0.0.0',
        userAgent: 'system',
        metadata: {
          targetUserId,
          targetEmail: targetUser.email,
        },
      },
    });

    return {
      accessToken: token,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
      },
    };
  }
}
