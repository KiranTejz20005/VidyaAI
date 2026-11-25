import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
} from '../types/socket.types';
import { env } from '../config/env';
import prisma from '../config/prisma';
import { logger } from '../utils/logger';

// Managers
import { ConnectionManager } from './managers/ConnectionManager';
import { RoomManager } from './managers/RoomManager';
import { PresenceManager } from './managers/PresenceManager';
import { MessageManager } from './managers/MessageManager';
import { registerTutorSocketHandlers } from './tutor.socket';
import { createSocketAuthMiddleware } from './socket-auth';
import { isUuid, SOCKET_LIMITS, TokenBucket } from './socket-guards';

type AppServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: AppServer | null = null;
let connectionManager: ConnectionManager | null = null;
let roomManager: RoomManager | null = null;
let presenceManager: PresenceManager | null = null;
let messageManager: MessageManager | null = null;

/**
 * Whether the authenticated socket user may receive realtime events for an
 * assignment: the assignment must belong to the user's organization (a
 * SUPER_ADMIN without a selected organization may watch any assignment).
 */
export async function canSubscribeToAssignment(
  user: { role: string; organizationId: string | null },
  assignmentId: string
): Promise<boolean> {
  if (!user.organizationId) {
    if (user.role !== 'SUPER_ADMIN') return false;
    const exists = await prisma.assignment.findFirst({ where: { id: assignmentId }, select: { id: true } });
    return Boolean(exists);
  }
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, organizationId: user.organizationId },
    select: { id: true },
  });
  return Boolean(assignment);
}

function parseOrigins(raw?: string): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://vidhyaai.tech',
    'https://www.vidhyaai.tech',
    'https://api.vidhyaai.tech',
    'https://vidyaai.tech',
    'https://www.vidyaai.tech',
  ]);

  if (raw) {
    const parsed = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\/+$/, ''));

    for (const item of parsed) {
      origins.add(item);
      try {
        const u = new URL(item);
        if (u.hostname.startsWith('www.')) {
          origins.add(`${u.protocol}//${u.hostname.slice(4)}${u.port ? ':' + u.port : ''}`);
        } else if (!u.hostname.startsWith('localhost') && !u.hostname.startsWith('127.')) {
          origins.add(`${u.protocol}//www.${u.hostname}${u.port ? ':' + u.port : ''}`);
        }
      } catch {
        // ignore
      }
    }
  }

  return Array.from(origins);
}

function isAllowedVercelPreview(hostname: string): boolean {
  // Only the specific production preview domain — no wildcard subdomains (CSWSH risk).
  return hostname === 'vedaai-ed.vercel.app';
}

function isAllowedSocketOrigin(origin: string, allowedOrigins: string[]): boolean {
  const normalized = origin.replace(/\/+$/, '');
  if (allowedOrigins.includes(normalized)) return true;
  try {
    return isAllowedVercelPreview(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

export function initializeSocketServer(
  httpServer: HTTPServer
): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  if (io) {
    logger.warn('Socket.IO already initialized — returning existing instance');
    return io;
  }

  const corsOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    ...(env.SOCKET_CORS_ORIGIN ? parseOrigins(env.SOCKET_CORS_ORIGIN) : parseOrigins(env.FRONTEND_URL)),
  ];

  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Browsers always send Origin on CORS requests. A missing Origin means a
        // non-browser client. With credentials enabled, reject in production to avoid
        // cross-site WebSocket hijacking; allow only in development.
        if (!origin) return callback(null, env.NODE_ENV !== 'production');
        callback(null, isAllowedSocketOrigin(origin, corsOrigins));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 12000,
    maxHttpBufferSize: SOCKET_LIMITS.maxHttpBufferSize,
    allowUpgrades: true,
    cookie: {
      name: 'vidyaai-socket',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
    },
  });

  // Initialize Managers
  connectionManager = new ConnectionManager(io);
  roomManager = new RoomManager(io);
  presenceManager = new PresenceManager(io);
  messageManager = new MessageManager(io);

  // Every connection must present a valid access token. The verified identity
  // lives on socket.data.user and cannot be changed by anything the client emits.
  io.use(
    createSocketAuthMiddleware({
      canAcceptConnection: (userId) =>
        (connectionManager?.getConnectionCount(userId) ?? 0) < SOCKET_LIMITS.maxConnectionsPerUser,
    })
  );

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    logger.debug(`Socket connected: ${socket.id} (transport: ${socket.conn.transport.name})`);

    const wasAlreadyConnected = connectionManager!.isUserConnected(user.id);
    connectionManager!.handleConnection(socket, user.id);
    if (!wasAlreadyConnected) presenceManager!.markOnline(user.id, user.organizationId);

    // General per-socket event budget; persistent abusers are disconnected.
    const budget = new TokenBucket(SOCKET_LIMITS.eventBurst, SOCKET_LIMITS.eventRefillPerSecond);
    let dropped = 0;
    const allow = (): boolean => {
      if (budget.tryRemove()) return true;
      dropped += 1;
      if (dropped > SOCKET_LIMITS.maxDroppedEventsBeforeDisconnect) {
        logger.warn(`Socket ${socket.id} exceeded event budget and was disconnected`);
        socket.disconnect(true);
      }
      return false;
    };

    socket.on('subscribe:assignment', async ({ assignmentId } = {} as { assignmentId: string }) => {
      if (!allow()) return;
      if (!isUuid(assignmentId)) return;
      if (socket.rooms.size > SOCKET_LIMITS.maxRoomsPerSocket) {
        logger.warn(`Socket ${socket.id} exceeded room cap and was disconnected`);
        socket.disconnect(true);
        return;
      }
      try {
        if (!(await canSubscribeToAssignment(user, assignmentId.trim()))) {
          logger.warn(`Socket ${socket.id} (user ${user.id}) denied assignment subscription`);
          return;
        }
        socket.join(`assignment:${assignmentId.trim()}`);
      } catch (err) {
        logger.warn({ err }, '[SOCKET] Assignment access check failed');
      }
    });

    socket.on('unsubscribe:assignment', ({ assignmentId } = {} as { assignmentId: string }) => {
      if (!allow() || !isUuid(assignmentId)) return;
      socket.leave(`assignment:${assignmentId.trim()}`);
    });

    socket.on('join:group', async ({ groupId } = {} as { groupId: string }) => {
      if (!allow()) return;
      const joined = await roomManager!.joinRoom(socket, groupId);
      if (!joined) return;
      const userIdsInRoom = roomManager!.getUsersInRoom(groupId);
      const onlineUserIds = userIdsInRoom.filter((id) => connectionManager!.isUserConnected(id));
      socket.emit('presence:sync', { onlineUserIds });
    });

    socket.on('leave:group', ({ groupId } = {} as { groupId: string }) => {
      if (!allow()) return;
      roomManager!.leaveRoom(socket, groupId);
    });

    socket.on('chat:send_message', (payload) => {
      if (!allow()) return;
      void messageManager!.handleSendMessage(socket, payload);
    });

    socket.on('typing', (payload) => {
      if (!allow()) return;
      messageManager!.handleTyping(socket, payload);
    });

    registerTutorSocketHandlers(socket);

    socket.on('disconnect', (reason) => {
      connectionManager!.handleDisconnect(socket);
      presenceManager!.markOffline(user.id, user.organizationId, () =>
        connectionManager!.isUserConnected(user.id)
      );
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  if (!io) throw new Error('Socket server not initialized');
  return io;
}

export function emitToAssignment<E extends keyof ServerToClientEvents>(
  assignmentId: string,
  event: E,
  payload: Parameters<ServerToClientEvents[E]>[0]
): void {
  if (!io) return;
  (io.to(`assignment:${assignmentId}`) as { emit: (ev: string, data: unknown) => void }).emit(event as any, payload);
}

export function emitToConversation(
  conversationId: string,
  event: string,
  payload: any
): void {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit(event as any, payload);
}

export function emitToGroup(groupId: string, event: string, payload: any) {
  if (!io) return;
  io.to(`group:${groupId}`).emit(event as any, payload);
}
