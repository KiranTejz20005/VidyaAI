import { Request, Response } from 'express';
import { ModerationService } from '../services/moderation.service';
import { tenantScope } from '../security/tenant-scope';

export const deletePost = async (req: Request, res: Response) => {
  const { id } = req.params;
  await ModerationService.deletePost(id, tenantScope(req));
  res.status(200).json({ status: 'success', message: 'Post deleted' });
};

export const deleteMessage = async (req: Request, res: Response) => {
  const { id } = req.params;
  await ModerationService.deleteMessage(id, tenantScope(req));
  res.status(200).json({ status: 'success', message: 'Message deleted' });
};

export const auditGroups = async (req: Request, res: Response) => {
  const groups = await ModerationService.auditGroups(tenantScope(req));
  res.status(200).json({ status: 'success', data: groups });
};

export const suspendGroup = async (req: Request, res: Response) => {
  const { id } = req.params;
  await ModerationService.suspendGroup(id, tenantScope(req));
  res.status(200).json({ status: 'success', message: 'Group suspended/deleted' });
};
