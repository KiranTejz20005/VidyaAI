import prisma from '../config/prisma';
import { NotFoundError } from '../api/common/errors';
import { CommunityService } from './community.service';

/** Prisma fragment confining a query to the caller's tenant (empty only for a platform-wide SUPER_ADMIN). */
export type ChatOrgScope = { organizationId?: string };

/**
 * Direct-message conversation ids are `dm_<userIdA>_<userIdB>`. Returns the two
 * participants, or null when the id is not a (well-formed) DM id.
 */
export function parseDmParticipants(conversationId: string): [string, string] | null {
  if (typeof conversationId !== 'string' || !conversationId.startsWith('dm_')) return null;
  const parts = conversationId.slice(3).split('_');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

export class ChatService {
  /**
   * Verifies the user may read/write a conversation. A DM is limited to its two
   * participants; any other conversation id is a group and follows group access
   * rules. Anything else is reported as missing (404), never as forbidden.
   */
  static async assertConversationAccess(conversationId: string, userId: string): Promise<void> {
    if (typeof conversationId === 'string' && conversationId.startsWith('dm_')) {
      const participants = parseDmParticipants(conversationId);
      if (!participants || !participants.includes(userId)) {
        throw new NotFoundError('Conversation not found');
      }
      return;
    }
    const allowed = await CommunityService.canAccessGroup(conversationId, userId);
    if (!allowed) throw new NotFoundError('Conversation not found');
  }

  /**
   * Save a message to the database
   */
  static async saveMessage(
    conversationId: string,
    senderId: string,
    message: string,
    attachments: any[] = [],
    scope: ChatOrgScope = {}
  ) {
    await ChatService.assertConversationAccess(conversationId, senderId);

    // A DM may only be addressed to a user of the sender's own organization.
    const participants = parseDmParticipants(conversationId);
    if (participants && scope.organizationId) {
      const recipientId = participants[0] === senderId ? participants[1] : participants[0];
      const recipient = await prisma.user.findFirst({
        where: { id: recipientId, organizationId: scope.organizationId },
        select: { id: true },
      });
      if (!recipient) throw new NotFoundError('Conversation not found');
    }

    return prisma.message.create({
      data: {
        conversationId,
        senderId,
        message,
        attachments,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
  }

  /**
   * Fetch chat history for a conversation
   */
  static async getMessages(conversationId: string, userId: string, limit: number = 50, cursor?: string) {
    await ChatService.assertConversationAccess(conversationId, userId);
    return prisma.message.findMany({
      where: { conversationId },
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { createdAt: 'asc' }, // Order asc for sequential rendering in chat bubbles
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
  }

  /**
   * Get all users in the same organization, excluding the current user
   */
  static async getOrgUsers(organizationId: string | null, currentUserId: string) {
    // Never fall back to listing users across organizations.
    if (!organizationId) return [];

    return prisma.user.findMany({
      where: {
        organizationId,
        id: { not: currentUserId },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
    });
  }

  /**
   * List all conversations (chats) that the current user has interacted in
   */
  static async getConversations(userId: string) {
    // Find unique conversationIds where user is participating (DMs only)
    const messages = await prisma.message.findMany({
      where: {
        AND: [
          { conversationId: { startsWith: 'dm_' } },
          { conversationId: { contains: userId } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['conversationId'],
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    // Populate details for each conversation (recipient name/avatar for DMs)
    const conversations = await Promise.all(messages.map(async (msg) => {
      const isDM = true;
      let name = '';
      let recipientId = '';
      let role = '';

      const ids = msg.conversationId.replace('dm_', '').split('_');
      const otherId = ids.find(id => id !== userId) || '';
      recipientId = otherId;

      const otherUser = await prisma.user.findUnique({
        where: { id: otherId },
        select: { firstName: true, lastName: true, role: true }
      });

      if (otherUser) {
        name = `${otherUser.firstName} ${otherUser.lastName}`;
        role = otherUser.role;
      } else {
        name = 'Unknown Builder';
      }

      return {
        id: msg.conversationId,
        name,
        isDM,
        recipientId,
        role,
        lastMessage: msg.message,
        lastMessageTime: msg.createdAt,
        unreadCount: 0
      };
    }));

    return conversations;
  }
}
