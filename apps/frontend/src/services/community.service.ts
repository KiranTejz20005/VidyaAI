import { api } from '@/lib/api';

export interface CommunityAuthor {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  author: CommunityAuthor;
  title?: string | null;
  content: string;
  type: 'DISCUSSION' | 'QUESTION' | 'PROJECT' | 'ANNOUNCEMENT';
  status: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  author: CommunityAuthor;
  content: string;
  createdAt: string;
}

export interface CreateCommunityPostInput {
  title?: string;
  content: string;
  type?: CommunityPost['type'];
  visibility?: 'PUBLIC' | 'PRIVATE' | 'ORG_ONLY';
  tags?: string[];
}

// The community module responds with `{ status: 'success', data }`.
export async function getCommunityFeed(limit = 20, cursor?: string): Promise<CommunityPost[]> {
  const res = await api.get('/community/posts/feed', { params: { limit, cursor } });
  return res.data.data ?? [];
}

export async function createCommunityPost(input: CreateCommunityPostInput): Promise<CommunityPost> {
  const res = await api.post('/community/posts', input);
  return res.data.data;
}

export async function getPostComments(postId: string): Promise<CommunityComment[]> {
  const res = await api.get(`/community/posts/${postId}/comments`);
  return res.data.data ?? [];
}

export async function addPostComment(postId: string, content: string): Promise<CommunityComment> {
  const res = await api.post(`/community/posts/${postId}/comments`, { content });
  return res.data.data;
}
