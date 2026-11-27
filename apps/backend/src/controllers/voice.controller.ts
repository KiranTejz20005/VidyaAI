import { Request, Response } from 'express';
import { VoiceService } from '../services/voice.service';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { tenantScope } from '../security/tenant-scope';

const createRoomSchema = z.object({
  name: z.string().min(3),
  type: z.enum(['STUDY', 'PROJECT', 'CASUAL', 'INTERVIEW']).default('CASUAL'),
});

/** Out-of-scope and missing rooms are both reported as 404 so ids never leak across tenants. */
function sendRoomError(res: Response, err: any, fallbackStatus: number) {
  const status = err?.message === 'Room not found' ? 404 : (err?.statusCode as number | undefined) ?? fallbackStatus;
  res.status(status).json({ status: 'error', error: err.message });
}

export const createVoiceRoom = async (req: Request, res: Response) => {
  try {
    const data = createRoomSchema.parse(req.body);
    const room = await VoiceService.createVoiceRoom(
      data.name,
      data.type,
      req.user!.id,
      tenantScope(req).organizationId
    );
    res.status(201).json({ status: 'success', data: room });
  } catch (err: any) {
    logger.error(err, '[VoiceController] Error creating room');
    sendRoomError(res, err, 400);
  }
};

export const getActiveRooms = async (req: Request, res: Response) => {
  try {
    const rooms = await VoiceService.getActiveRooms(tenantScope(req));
    res.status(200).json({ status: 'success', data: rooms });
  } catch (err: any) {
    logger.error(err, '[VoiceController] Error fetching rooms');
    sendRoomError(res, err, 500);
  }
};

export const generateToken = async (req: Request, res: Response) => {
  try {
    const { roomName } = req.params;
    const user = req.user!;
    // Tokens are only issued for active rooms of the caller's own organization.
    await VoiceService.findActiveRoomByName(roomName, tenantScope(req));
    // Fetch full user name from DB since req.user only has partial fields
    const participantIdentity = user.id;
    const participantName = user.id.slice(0, 8); // fallback

    const token = await VoiceService.generateToken(roomName, participantName, participantIdentity);
    const livekitUrl = VoiceService.getLiveKitUrl();
    res.status(200).json({ status: 'success', data: { token, livekitUrl, roomName } });
  } catch (err: any) {
    logger.error(err, '[VoiceController] Error generating token');
    sendRoomError(res, err, 500);
  }
};

export const joinRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    await VoiceService.joinRoom(roomId, req.user!.id, tenantScope(req));
    res.status(200).json({ status: 'success', data: { joined: true } });
  } catch (err: any) {
    logger.error(err, '[VoiceController] Error joining room');
    sendRoomError(res, err, 400);
  }
};

export const leaveRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    await VoiceService.leaveRoom(roomId, req.user!.id, tenantScope(req));
    res.status(200).json({ status: 'success', data: { left: true } });
  } catch (err: any) {
    logger.error(err, '[VoiceController] Error leaving room');
    sendRoomError(res, err, 400);
  }
};

export const closeRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    await VoiceService.closeRoom(roomId, req.user!.id, tenantScope(req));
    res.status(200).json({ status: 'success', data: { closed: true } });
  } catch (err: any) {
    logger.error(err, '[VoiceController] Error closing room');
    sendRoomError(res, err, 403);
  }
};
