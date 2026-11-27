import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  voiceRoom: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  voiceRoomParticipant: { upsert: vi.fn(), updateMany: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  communityPost: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  communityComment: { findMany: vi.fn(), create: vi.fn() },
  savedPost: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
  communityGroup: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
  groupMember: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  groupStudent: { findMany: vi.fn(), findFirst: vi.fn() },
  group: { findUnique: vi.fn() },
}));

vi.mock('../../config/prisma', () => ({ default: prismaMock }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../sockets/socket.server', () => ({ emitToGroup: vi.fn() }));

import * as VoiceController from '../../controllers/voice.controller';
import * as ChatController from '../../controllers/chat.controller';
import * as CommunityController from '../../controllers/community.controller';
import * as ModerationController from '../../controllers/moderation.controller';
import { CommunityService, canViewPost } from '../../services/community.service';
import { ChatService } from '../../services/chat.service';
import { NotFoundError } from '../../api/common/errors';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NO_ORG = '00000000-0000-0000-0000-000000000000';

const makeReq = (over: Record<string, unknown> = {}) =>
  ({
    user: { id: USER_A, role: 'STUDENT', organizationId: ORG_A },
    params: {},
    query: {},
    body: {},
    ...over,
  }) as any;

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.organization.findUnique.mockImplementation(async ({ where }: any) =>
    [ORG_A, ORG_B].includes(where.id) ? { id: where.id } : null,
  );
});

describe('voice rooms are tenant scoped', () => {
  it('refuses a LiveKit token for a room name that exists only in another organization', async () => {
    prismaMock.voiceRoom.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await VoiceController.generateToken(makeReq({ params: { roomName: 'secret-room' } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.data).toBeUndefined();
    expect(prismaMock.voiceRoom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ name: 'secret-room', organizationId: ORG_A }) }),
    );
  });

  it('issues a token for a room inside the caller organization', async () => {
    prismaMock.voiceRoom.findFirst.mockResolvedValue({ id: 'r1', name: 'room' });
    const res = makeRes();
    await VoiceController.generateToken(makeReq({ params: { roomName: 'room' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it('joining a room of another organization is a 404 and never upserts a participant', async () => {
    prismaMock.voiceRoom.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await VoiceController.joinRoom(makeReq({ params: { roomId: 'foreign' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.voiceRoomParticipant.upsert).not.toHaveBeenCalled();
    expect(prismaMock.voiceRoom.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: ORG_A } });
  });

  it('closing a room of another organization is a 404 and never deactivates it', async () => {
    prismaMock.voiceRoom.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await VoiceController.closeRoom(makeReq({ params: { roomId: 'foreign' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prismaMock.voiceRoom.update).not.toHaveBeenCalled();
  });

  it('leaving is confined to rooms of the caller organization', async () => {
    prismaMock.voiceRoomParticipant.updateMany.mockResolvedValue({ count: 0 });
    await VoiceController.leaveRoom(makeReq({ params: { roomId: 'foreign' } }), makeRes());
    expect(prismaMock.voiceRoomParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ room: { organizationId: ORG_A } }) }),
    );
  });

  it('an account without an organization cannot list rooms', async () => {
    const res = makeRes();
    await VoiceController.getActiveRooms(makeReq({ user: { id: USER_A, role: 'STUDENT', organizationId: NO_ORG } }), res);
    expect(res.statusCode).toBe(403);
    expect(prismaMock.voiceRoom.findMany).not.toHaveBeenCalled();
  });
});

describe('direct messages are limited to their participants and tenant', () => {
  const dm = `dm_${[USER_A, USER_B].sort().join('_')}`;
  const stranger = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  it('a non-participant cannot read a DM', async () => {
    await expect(ChatService.getMessages(dm, stranger)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  it('a participant can read their DM', async () => {
    prismaMock.message.findMany.mockResolvedValue([]);
    await expect(ChatService.getMessages(dm, USER_A)).resolves.toEqual([]);
  });

  it('a non-participant cannot post into a DM they are not part of', async () => {
    await expect(ChatService.saveMessage(dm, stranger, 'hi', [], { organizationId: ORG_A })).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it('cannot DM a user of another organization', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(ChatService.saveMessage(dm, USER_A, 'hi', [], { organizationId: ORG_A })).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: USER_B, organizationId: ORG_A },
      select: { id: true },
    });
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it('the REST controller never lists users of other organizations for an orgless caller', async () => {
    const res = makeRes();
    await ChatController.getOrgUsers(makeReq({ user: { id: USER_A, role: 'STUDENT', organizationId: null } }), res);
    expect(res.body.data).toEqual([]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it('the REST controller passes the authenticated user to the access check', async () => {
    const res = makeRes();
    await expect(
      ChatController.getMessages(
        makeReq({ user: { id: stranger, role: 'STUDENT', organizationId: ORG_A }, params: { conversationId: dm } }),
        res,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('community posts honour visibility and tenant', () => {
  it('canViewPost: ORG_ONLY is limited to the post organization, PRIVATE to the author', () => {
    const base = { authorId: USER_B, organizationId: ORG_B };
    expect(canViewPost({ ...base, visibility: 'ORG_ONLY' }, USER_A, ORG_A)).toBe(false);
    expect(canViewPost({ ...base, visibility: 'ORG_ONLY' }, USER_A, ORG_B)).toBe(true);
    expect(canViewPost({ ...base, visibility: 'PRIVATE' }, USER_A, ORG_B)).toBe(false);
    expect(canViewPost({ ...base, visibility: 'PRIVATE' }, USER_B, ORG_B)).toBe(true);
    expect(canViewPost({ ...base, visibility: 'PUBLIC' }, USER_A, ORG_A)).toBe(true);
  });

  it('reading an ORG_ONLY post of another organization returns 404', async () => {
    prismaMock.communityPost.findUnique.mockResolvedValue({ id: 'p', authorId: USER_B, visibility: 'ORG_ONLY', organizationId: ORG_B });
    await expect(CommunityService.getPost('p', USER_A, ORG_A)).rejects.toBeInstanceOf(NotFoundError);
    const res = makeRes();
    await expect(CommunityController.getPost(makeReq({ params: { id: 'p' } }), res)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cannot read comments of, comment on, or save a post the caller cannot see', async () => {
    prismaMock.communityPost.findUnique.mockResolvedValue({ id: 'p', authorId: USER_B, visibility: 'PRIVATE', organizationId: ORG_B });
    await expect(CommunityService.getComments('p', USER_A, ORG_A)).rejects.toBeInstanceOf(NotFoundError);
    await expect(CommunityService.addComment('p', USER_A, 'x', ORG_A)).rejects.toBeInstanceOf(NotFoundError);
    await expect(CommunityService.toggleSavePost('p', USER_A, ORG_A)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.communityComment.create).not.toHaveBeenCalled();
    expect(prismaMock.savedPost.create).not.toHaveBeenCalled();
  });

  it('editing or deleting another users post is reported as missing', async () => {
    prismaMock.communityPost.findUnique.mockResolvedValue({ id: 'p', authorId: USER_B });
    await expect(CommunityService.updatePost('p', USER_A, { content: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(CommunityService.deletePost('p', USER_A)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.communityPost.delete).not.toHaveBeenCalled();
  });
});

describe('community groups, search and leaderboard are tenant scoped', () => {
  it('user search is confined to the caller organization and empty without one', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    await CommunityService.searchUsers('ali', undefined, ORG_A);
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG_A });

    prismaMock.user.findMany.mockClear();
    await expect(CommunityService.searchUsers('ali', undefined, NO_ORG)).resolves.toEqual([]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it('the leaderboard never spans organizations', async () => {
    await expect(CommunityService.getTopContributors(NO_ORG)).resolves.toEqual([]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it('an orgless user only sees org-less groups, not every tenant', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'a@example.test' });
    prismaMock.groupStudent.findMany.mockResolvedValue([]);
    prismaMock.communityGroup.findMany.mockResolvedValue([]);
    await CommunityService.getGroups(NO_ORG, USER_A);
    const where = prismaMock.communityGroup.findMany.mock.calls[0][0].where;
    expect(where.OR[0]).toMatchObject({ organizationId: null });
  });

  it('cannot join a group of another organization', async () => {
    prismaMock.communityGroup.findUnique.mockResolvedValue({ id: 'g', type: 'PUBLIC', organizationId: ORG_B });
    await expect(CommunityService.joinGroup('g', USER_A, ORG_A)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.groupMember.upsert).not.toHaveBeenCalled();
  });

  it('group chat and member list of a foreign PUBLIC group are denied', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'a@example.test', role: 'STUDENT', organizationId: ORG_A });
    prismaMock.groupMember.findUnique.mockResolvedValue(null);
    prismaMock.communityGroup.findUnique.mockResolvedValue({ id: 'g', type: 'PUBLIC', ownerId: USER_B, organizationId: ORG_B });
    prismaMock.group.findUnique.mockResolvedValue(null);
    await expect(CommunityService.getGroupMessages('g', USER_A)).rejects.toThrow('Unauthorized');
    await expect(CommunityService.sendGroupMessage('g', USER_A, 'hi')).rejects.toThrow('Unauthorized');
    await expect(CommunityService.getGroupMembers('g', USER_A)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it('non-members cannot read an INVITE_ONLY group of their own organization either', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'a@example.test', role: 'STUDENT', organizationId: ORG_A });
    prismaMock.groupMember.findUnique.mockResolvedValue(null);
    prismaMock.communityGroup.findUnique.mockResolvedValue({ id: 'g', type: 'INVITE_ONLY', ownerId: USER_B, organizationId: ORG_A });
    prismaMock.group.findUnique.mockResolvedValue(null);
    await expect(CommunityService.canAccessGroup('g', USER_A)).resolves.toBe(false);
  });

  it('a PUBLIC group of the same organization stays reachable', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'a@example.test', role: 'STUDENT', organizationId: ORG_A });
    prismaMock.groupMember.findUnique.mockResolvedValue(null);
    prismaMock.communityGroup.findUnique.mockResolvedValue({ id: 'g', type: 'PUBLIC', ownerId: USER_B, organizationId: ORG_A });
    await expect(CommunityService.canAccessGroup('g', USER_A)).resolves.toBe(true);
  });

  it('invites only resolve users inside the group organization', async () => {
    prismaMock.communityGroup.findUnique.mockResolvedValue({ id: 'g', ownerId: USER_A, organizationId: ORG_A });
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(CommunityService.inviteToGroup('g', USER_A, 'victim@other.example')).rejects.toThrow('User not found');
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: ORG_A });
    expect(prismaMock.groupMember.upsert).not.toHaveBeenCalled();
  });
});

describe('moderation cannot cross organizations', () => {
  const adminA = { user: { id: USER_A, role: 'ADMIN', organizationId: ORG_A } };

  it('an org ADMIN cannot delete a post, message or group of another organization', async () => {
    prismaMock.communityPost.findFirst.mockResolvedValue(null);
    prismaMock.message.findFirst.mockResolvedValue(null);
    prismaMock.communityGroup.findFirst.mockResolvedValue(null);

    await expect(ModerationController.deletePost(makeReq({ ...adminA, params: { id: 'p' } }), makeRes())).rejects.toBeInstanceOf(NotFoundError);
    await expect(ModerationController.deleteMessage(makeReq({ ...adminA, params: { id: 'm' } }), makeRes())).rejects.toBeInstanceOf(NotFoundError);
    await expect(ModerationController.suspendGroup(makeReq({ ...adminA, params: { id: 'g' } }), makeRes())).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.communityPost.findFirst).toHaveBeenCalledWith({ where: { id: 'p', organizationId: ORG_A } });
    expect(prismaMock.message.findFirst).toHaveBeenCalledWith({ where: { id: 'm', sender: { organizationId: ORG_A } } });
    expect(prismaMock.communityGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g', organizationId: ORG_A } }));
    expect(prismaMock.communityPost.delete).not.toHaveBeenCalled();
    expect(prismaMock.message.delete).not.toHaveBeenCalled();
    expect(prismaMock.communityGroup.delete).not.toHaveBeenCalled();
  });

  it('the group audit is filtered to the admin organization', async () => {
    prismaMock.communityGroup.findMany.mockResolvedValue([]);
    await ModerationController.auditGroups(makeReq(adminA), makeRes());
    expect(prismaMock.communityGroup.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG_A });
  });
});
