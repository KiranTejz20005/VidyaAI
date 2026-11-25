import { Server as SocketIOServer, Socket } from 'socket.io';
import { CommunityService } from '../../services/community.service';
import { logger } from '../../utils/logger';
import { isUuid } from '../socket-guards';

export function groupRoom(groupId: string): string {
  return `group:${groupId}`;
}

/** Membership check shared with the REST chat endpoints (CommunityService.checkGroupAccess). */
export async function canAccessGroup(groupId: string, userId: string): Promise<boolean> {
  return Boolean(await CommunityService['checkGroupAccess'](groupId, userId));
}

export class RoomManager {
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  /**
   * Joins the socket to a group room only after verifying that the
   * authenticated user is a member of (or otherwise allowed into) the group.
   */
  async joinRoom(socket: Socket, roomId: unknown): Promise<boolean> {
    const userId: string | undefined = socket.data.user?.id;
    if (!userId || !isUuid(roomId)) return false;

    const groupId = roomId.trim();
    let allowed = false;
    try {
      allowed = await canAccessGroup(groupId, userId);
    } catch (err) {
      logger.warn({ err, groupId }, '[RoomManager] Group access check failed');
      allowed = false;
    }
    if (!allowed) {
      logger.warn(`[RoomManager] Socket ${socket.id} (User: ${userId}) denied access to group ${groupId}`);
      return false;
    }

    const formattedRoomId = groupRoom(groupId);
    socket.join(formattedRoomId);
    logger.debug(`[RoomManager] Socket ${socket.id} (User: ${userId}) joined room ${formattedRoomId}`);
    return true;
  }

  leaveRoom(socket: Socket, roomId: unknown) {
    if (!isUuid(roomId)) return;
    const formattedRoomId = groupRoom(roomId.trim());
    socket.leave(formattedRoomId);
    logger.debug(`[RoomManager] Socket ${socket.id} (User: ${socket.data.user?.id}) left room ${formattedRoomId}`);
  }

  isInRoom(socket: Socket, groupId: unknown): boolean {
    return isUuid(groupId) && socket.rooms.has(groupRoom(groupId.trim()));
  }

  getUsersInRoom(roomId: string): string[] {
    const formattedRoomId = groupRoom(roomId);
    const sockets = this.io.sockets.adapter.rooms.get(formattedRoomId);
    if (!sockets) return [];

    const userIds = new Set<string>();
    for (const socketId of sockets) {
      const socket = this.io.sockets.sockets.get(socketId);
      const userId: string | undefined = socket?.data.user?.id;
      if (userId) {
        userIds.add(userId);
      }
    }
    return Array.from(userIds);
  }
}
