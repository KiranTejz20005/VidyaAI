import type { OrganizationStatus } from '@prisma/client';
import prisma from '../../config/prisma';
import { hashPassword } from '../auth.service';
import { generateTemporaryPassword } from '../../security/credentials';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../api/common/errors';
import type { AdminActor } from './admin-scope';

const ORGANIZATION_STATUSES: readonly OrganizationStatus[] = ['ACTIVE', 'SUSPENDED', 'TRIAL', 'EXPIRED', 'ARCHIVED'];

/** Fields an organization's own ADMIN may change; everything else is SUPER_ADMIN-only. */
const ORG_ADMIN_EDITABLE_FIELDS = ['name', 'email', 'phone', 'address'] as const;
const SUPER_ADMIN_ONLY_FIELDS = ['code', 'status', 'adminEmail'] as const;

export interface UpdateOrganizationInput {
  name?: string;
  code?: string;
  email?: string | null;
  address?: string | null;
  phone?: string | null;
  status?: string;
  adminEmail?: string | null;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Creates the organization's ADMIN account with a one-time password. The
 * password is returned once so the SUPER_ADMIN can deliver it out of band.
 */
async function createOrganizationAdmin(tx: Tx, organization: { id: string; name: string }, adminEmail: string): Promise<string> {
  const email = adminEmail.trim().toLowerCase();
  const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new ConflictError('User with this email already exists.');
  const tempPassword = generateTemporaryPassword();
  await tx.user.create({
    data: {
      email,
      passwordHash: await hashPassword(tempPassword),
      firstName: 'Admin',
      lastName: organization.name,
      role: 'ADMIN',
      organizationId: organization.id,
      status: 'ACTIVE',
      forcePasswordReset: true,
      hasCompletedOnboarding: false,
    },
  });
  return tempPassword;
}

export class OrganizationService {
  static async createOrganization(data: {
    name: string;
    code: string;
    email?: string;
    phone?: string;
    address?: string;
    adminEmail?: string;
  }) {
    const codeTaken = await prisma.organization.findUnique({ where: { code: data.code }, select: { id: true } });
    if (codeTaken) throw new ConflictError('Organization code already in use.');

    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: data.name,
          code: data.code,
          slug: data.name.toLowerCase().replace(/\s+/g, '-'),
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
          status: 'ACTIVE',
        },
      });

      const tempPassword = data.adminEmail ? await createOrganizationAdmin(tx, organization, data.adminEmail) : null;
      return { organization, tempPassword };
    });
  }

  static async getOrganizations() {
    return prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          where: { role: 'ADMIN' },
          select: { email: true },
          take: 1,
        },
        _count: {
          select: {
            users: true,
            departments: true,
          },
        },
      },
    });
  }

  static async getOrganizationById(id: string) {
    return prisma.organization.findUnique({
      where: { id },
      include: {
        departments: true,
      },
    });
  }

  /**
   * Updates an organization on behalf of `actor`. A non-super caller may only
   * edit name/email/phone/address of its own organization. `adminEmail` never
   * rewrites an existing account: it is a no-op when that admin already
   * belongs to the organization, otherwise a new ADMIN is created with a
   * one-time password that is returned once.
   */
  static async updateOrganization(actor: AdminActor, id: string, data: UpdateOrganizationInput) {
    if (!actor.isSuperAdmin) {
      if (actor.organizationId !== id) throw new NotFoundError('Organization not found');
      const forbidden = SUPER_ADMIN_ONLY_FIELDS.filter((f) => data[f] !== undefined && data[f] !== null && data[f] !== '');
      if (forbidden.length > 0) {
        throw new ForbiddenError(`Only a SUPER_ADMIN can change: ${forbidden.join(', ')}`);
      }
    }

    const existing = await prisma.organization.findUnique({ where: { id }, select: { id: true, code: true } });
    if (!existing) throw new NotFoundError('Organization not found');

    const update: { name?: string; email?: string | null; phone?: string | null; address?: string | null; code?: string; status?: OrganizationStatus } = {};
    if (data.name !== undefined) {
      if (!data.name) throw new ValidationError('Organization name is required');
      update.name = data.name;
    }
    for (const field of ORG_ADMIN_EDITABLE_FIELDS) {
      if (field === 'name' || data[field] === undefined) continue;
      update[field] = data[field] || null;
    }

    if (actor.isSuperAdmin) {
      if (data.code && data.code !== existing.code) {
        const codeTaken = await prisma.organization.findUnique({ where: { code: data.code }, select: { id: true } });
        if (codeTaken) throw new ConflictError('Organization code already in use.');
        update.code = data.code;
      }
      if (data.status) {
        if (!(ORGANIZATION_STATUSES as readonly string[]).includes(data.status)) {
          throw new ValidationError('Invalid organization status');
        }
        update.status = data.status as OrganizationStatus;
      }
    }

    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.update({ where: { id }, data: update });

      let tempPassword: string | null = null;
      if (actor.isSuperAdmin && data.adminEmail) {
        const email = data.adminEmail.trim().toLowerCase();
        const current = await tx.user.findUnique({ where: { email }, select: { organizationId: true, role: true } });
        if (current) {
          if (current.organizationId !== id || current.role !== 'ADMIN') {
            throw new ConflictError('User with this email already exists.');
          }
        } else {
          tempPassword = await createOrganizationAdmin(tx, organization, email);
        }
      }

      return { organization, tempPassword };
    });
  }

  static async deleteOrganization(id: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Delete deeply nested dependent records
      await tx.studentSubmission.deleteMany({ where: { organizationId: id } });
      await tx.generatedPaper.deleteMany({ where: { organizationId: id } });
      await tx.assignment.deleteMany({ where: { organizationId: id } });
      await tx.assessment.deleteMany({ where: { organizationId: id } });
      await tx.question.deleteMany({ where: { organizationId: id } });
      await tx.questionBank.deleteMany({ where: { organizationId: id } });
      await tx.quizSession.deleteMany({ where: { organizationId: id } });
      await tx.tutorSession.deleteMany({ where: { organizationId: id } });
      await tx.teacherTutorConfig.deleteMany({ where: { organizationId: id } });
      await tx.attendanceRecord.deleteMany({ where: { organizationId: id } });
      await tx.leaveApplication.deleteMany({ where: { organizationId: id } });
      await tx.libraryResource.deleteMany({ where: { organizationId: id } });
      await tx.knowledgeDocument.deleteMany({ where: { organizationId: id } });
      await tx.promptExecution.deleteMany({ where: { organizationId: id } });
      await tx.promptTemplate.deleteMany({ where: { organizationId: id } });
      await tx.approvalRecord.deleteMany({ where: { organizationId: id } });
      await tx.academicReport.deleteMany({ where: { organizationId: id } });
      await tx.copilotWorkflow.deleteMany({ where: { organizationId: id } });
      await tx.rubric.deleteMany({ where: { organizationId: id } });
      await tx.aIRecommendation.deleteMany({ where: { organizationId: id } });
      await tx.blueprint.deleteMany({ where: { organizationId: id } });
      await tx.course.deleteMany({ where: { organizationId: id } });
      await tx.program.deleteMany({ where: { organizationId: id } });
      await tx.syllabus.deleteMany({ where: { organizationId: id } });
      await tx.lessonPlan.deleteMany({ where: { organizationId: id } });
      await tx.worksheet.deleteMany({ where: { organizationId: id } });
      await tx.generatedNotes.deleteMany({ where: { organizationId: id } });
      await tx.voiceRoom.deleteMany({ where: { organizationId: id } });
      await tx.meeting.deleteMany({ where: { organizationId: id } });
      await tx.communityPost.deleteMany({ where: { organizationId: id } });
      await tx.communityGroup.deleteMany({ where: { organizationId: id } });
      await tx.classGroup.deleteMany({ where: { organizationId: id } });
      await tx.group.deleteMany({ where: { organizationId: id } });
      await tx.class.deleteMany({ where: { organizationId: id } });
      await tx.classroom.deleteMany({ where: { organizationId: id } });
      await tx.department.deleteMany({ where: { organizationId: id } });
      await tx.invitation.deleteMany({ where: { organizationId: id } });
      await tx.subscription.deleteMany({ where: { organizationId: id } });
      await tx.auditLog.deleteMany({ where: { organizationId: id } });
      await tx.notification.deleteMany({ where: { organizationId: id } });

      // 2. Safely dissociate users belonging to this organization so foreign key references to user accounts remain intact
      await tx.user.updateMany({
        where: { organizationId: id },
        data: { organizationId: null, activeOrganizationId: null },
      });

      // 3. Delete the organization record
      return tx.organization.delete({
        where: { id },
      });
    });
  }

  static async suspendOrganization(id: string, suspend: boolean = true) {
    if (!id) throw new ValidationError('Organization ID is required');
    const existing = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundError('Organization not found');
    }

    const nextStatus = suspend ? 'SUSPENDED' : 'ACTIVE';
    return prisma.organization.update({
      where: { id },
      data: {
        status: nextStatus,
        updatedAt: new Date(),
      },
    });
  }

  static async getOrganizationAnalytics(organizationId: string) {
    const totalUsers = await prisma.user.count({ where: { organizationId } });
    const facultyCount = await prisma.user.count({
      where: {
        organizationId,
        role: 'TEACHER',
      },
    });
    const studentCount = await prisma.student.count({
      where: {
        group: {
          userId: {
            in: (
              await prisma.user.findMany({
                where: { organizationId },
                select: { id: true },
              })
            ).map((u) => u.id),
          },
        },
      },
    });

    const [papersGenerated, aiUsage] = await Promise.all([
      prisma.generatedPaper.count({ where: { organizationId } }),
      prisma.promptExecution.aggregate({
        where: { organizationId },
        _sum: { tokensPrompt: true, tokensCompletion: true, costUsd: true },
      }),
    ]);
    const totalTokensUsed = (aiUsage._sum.tokensPrompt ?? 0) + (aiUsage._sum.tokensCompletion ?? 0);
    const estimatedCost = aiUsage._sum.costUsd ?? 0;

    return {
      totalUsers,
      facultyCount,
      studentCount,
      papersGenerated,
      aiUsage: {
        tokensUsed: totalTokensUsed,
        estimatedCost,
      },
    };
  }
}
