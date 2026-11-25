import { Server as SocketIOServer, Socket } from 'socket.io';
import { CommunityService } from '../../services/community.service';
import { logger } from '../../utils/logger';
import { isBoundedText, isUuid, SOCKET_LIMITS } from '../socket-guards';
import { groupRoom } from './RoomManager';

const MAX_TEMP_ID_LENGTH = 100;

function sanitizeTempId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= MAX_TEMP_ID_LENGTH ? value : undefined;
}

export class MessageManager {
  private io: SocketIOServer;

  // Track typing timeouts to auto-clear stuck indicators
  private typingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  /**
   * Persists and broadcasts a chat message. The caller must already have
   * verified that the socket joined the group room (membership-checked).
   */
  async handleSendMessage(socket: Socket, payload: { groupId?: unknown; content?: unknown; tempId?: unknown }) {
    const userId: string | undefined = socket.data.user?.id;
    const tempId = sanitizeTempId(payload?.tempId);
    if (!userId || !isUuid(payload?.groupId)) return;
    const groupId = payload.groupId.trim();

    if (!isBoundedText(payload.content, SOCKET_LIMITS.maxMessageLength)) {
      socket.emit('chat:error', {
        tempId,
        error: `Message must be between 1 and ${SOCKET_LIMITS.maxMessageLength} characters`,
      });
      return;
    }

    try {
      // 1. Persist to database (re-checks group access)
      const message = await CommunityService.sendGroupMessage(
        groupId,
        userId,
        payload.content,
        []
      );

      // 2. Broadcast to the room, echoing tempId so the sender can reconcile its optimistic copy.
      this.io.to(groupRoom(groupId)).emit('chat:message', { ...message, tempId });

      // Stop typing automatically when a message is sent
      this.handleTyping(socket, { groupId, isTyping: false });
    } catch (error) {
      logger.error({ err: error, groupId }, '[MessageManager] Failed to send message');
      socket.emit('chat:error', { tempId, error: 'Failed to send message' });
    }
  }

  /** Broadcasts a typing indicator. The caller must have verified room membership. */
  handleTyping(socket: Socket, payload: { groupId?: unknown; isTyping?: unknown }) {
    const userId: string | undefined = socket.data.user?.id;
    if (!userId || !isUuid(payload?.groupId)) return;
    const groupId = payload.groupId.trim();
    const isTyping = payload.isTyping === true;

    const timeoutKey = `${groupId}:${userId}`;

    // Clear any existing timeout
    if (this.typingTimeouts.has(timeoutKey)) {
      clearTimeout(this.typingTimeouts.get(timeoutKey)!);
      this.typingTimeouts.delete(timeoutKey);
    }

    // Broadcast state
    socket.to(groupRoom(groupId)).emit('chat:typing', {
      userId,
      isTyping,
    });

    // If they are typing, set a timeout to auto-clear after 3 seconds
    if (isTyping) {
      const timeout = setTimeout(() => {
        socket.to(groupRoom(groupId)).emit('chat:typing', {
          userId,
          isTyping: false,
        });
        this.typingTimeouts.delete(timeoutKey);
      }, 3000);
      this.typingTimeouts.set(timeoutKey, timeout);
    }
  }
}
