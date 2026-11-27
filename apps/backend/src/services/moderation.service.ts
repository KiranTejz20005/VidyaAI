import prisma from '../config/prisma';
import { NotFoundError } from '../api/common/errors';

/** Prisma fragment confining moderation to the caller's tenant (empty only for a platform-wide SUPER_ADMIN). */
export type ModerationScope = { organizationId?: string };


export class ModerationService {
  /**
   * Delete a community post (Admin only)
   */
  static async deletePost(postId: string, scope: ModerationScope) {
    const post = await prisma.communityPost.findFirst({ where: { id: postId, ...scope } });
    if (!post) throw new NotFoundError('Post not found');
    return prisma.communityPost.delete({ where: { id: postId } });
  }

  /**
   * Delete a message (Admin only)
   */
  static async deleteMessage(messageId: string, scope: ModerationScope) {
    // A message belongs to the tenant of its sender.
    const message = await prisma.message.findFirst({
      where: { id: messageId, ...(scope.organizationId ? { sender: { organizationId: scope.organizationId } } : {}) },
    });
    if (!message) throw new NotFoundError('Message not found');
    return prisma.message.delete({ where: { id: messageId } });
  }

  /**
   * List all groups for auditing
   */
  static async auditGroups(scope: ModerationScope) {
    return prisma.communityGroup.findMany({
      where: { ...scope },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Suspend a group
   */
  static async suspendGroup(groupId: string, scope: ModerationScope) {
    const group = await prisma.communityGroup.findFirst({ where: { id: groupId, ...scope }, select: { id: true } });
    if (!group) throw new NotFoundError('Group not found');
    // We could add an "isActive" field to CommunityGroup or simply delete it
    return prisma.communityGroup.delete({ where: { id: groupId } });
  }
}
