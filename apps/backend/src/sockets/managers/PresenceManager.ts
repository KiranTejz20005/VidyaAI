import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';

export function orgRoom(organizationId: string): string {
  return `org:${organizationId}`;
}

export class PresenceManager {
  private io: SocketIOServer;

  // We rely on the ConnectionManager to ensure uniqueness.
  // This manager broadcasts presence states, confined to the user's organization.
  constructor(io: SocketIOServer) {
    this.io = io;
  }

  markOnline(userId: string, organizationId: string | null) {
    if (!organizationId) return;
    logger.debug(`[PresenceManager] Broadcasting USER_ONLINE for ${userId}`);
    this.io.to(orgRoom(organizationId)).emit('presence:online', { userId });
  }

  markOffline(userId: string, organizationId: string | null, isStillConnected: () => boolean = () => false) {
    if (!organizationId) return;
    // Add a slight debounce to prevent UI flickering on temporary network drops
    setTimeout(() => {
      if (isStillConnected()) return;
      logger.debug(`[PresenceManager] Broadcasting USER_OFFLINE for ${userId}`);
      this.io.to(orgRoom(organizationId)).emit('presence:offline', { userId });
    }, 2000);
  }

  syncRoomPresence(roomId: string, onlineUserIds: string[]) {
    // Allows sending the full state to a room (e.g. when someone joins)
    this.io.to(`group:${roomId}`).emit('presence:sync', { onlineUserIds });
  }
}
