'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/design-system/PageHeader';
import { Card } from '@/design-system/Card';
import { Button } from '@/design-system/Button';
import { EmptyState } from '@/design-system/EmptyState';
import { ErrorState } from '@/design-system/ErrorState';
import { LoadingState } from '@/design-system/LoadingState';
import {
  addPostComment,
  createCommunityPost,
  getCommunityFeed,
  getPostComments,
  type CommunityAuthor,
  type CommunityComment,
  type CommunityPost,
} from '@/services/community.service';

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error || e?.response?.data?.message || fallback;
}

function authorName(author?: CommunityAuthor): string {
  if (!author) return 'Unknown';
  return `${author.firstName} ${author.lastName}`.trim() || 'Unknown';
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function Avatar({ author, size }: { author?: CommunityAuthor; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--bg-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}
    >
      {authorName(author).charAt(0).toUpperCase()}
    </div>
  );
}

function PostCard({ post }: { post: CommunityPost }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [count, setCount] = useState(post.commentsCount ?? 0);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    setCommentsError(null);
    try {
      setComments(await getPostComments(post.id));
    } catch (err) {
      const message = errorMessage(err, 'Failed to load replies');
      setCommentsError(message);
      toast.error(message);
    } finally {
      setLoadingComments(false);
    }
  }, [post.id]);

  const toggle = () => {
    if (!open && comments === null) loadComments();
    setOpen((v) => !v);
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    try {
      const created = await addPostComment(post.id, content);
      setComments((prev) => [...(prev ?? []), created]);
      setCount((c) => c + 1);
      setDraft('');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to post reply'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card padding="24px">
      <div style={{ display: 'flex', gap: 16 }}>
        <Avatar author={post.author} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{authorName(post.author)}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{formatTime(post.createdAt)}</span>
          </div>
          {post.title && <h3 style={{ margin: '0 0 6px 0', fontSize: 'var(--text-base)', fontWeight: 600 }}>{post.title}</h3>}
          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {post.content}
          </p>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
          >
            <MessageSquare size={16} /> <span style={{ fontSize: 'var(--text-sm)' }}>{count} {count === 1 ? 'reply' : 'replies'}</span>
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 24, marginLeft: 24, paddingLeft: 24, borderLeft: '2px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loadingComments ? (
            <LoadingState lines={2} />
          ) : commentsError ? (
            <ErrorState message={commentsError} onRetry={loadComments} />
          ) : (
            <>
              {(comments ?? []).length === 0 && (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No replies yet. Be the first to respond.</p>
              )}
              {(comments ?? []).map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 12 }}>
                  <Avatar author={c.author} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{authorName(c.author)}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{formatTime(c.createdAt)}</span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                  </div>
                </div>
              ))}
              <form onSubmit={submitComment} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  aria-label="Write a reply"
                  placeholder="Write a reply..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ flex: 1, padding: '10px 16px', border: '1px solid var(--border)', borderRadius: 24, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary)' }}
                />
                <Button type="submit" variant="primary" size="sm" disabled={sending || !draft.trim()}>
                  <Send size={14} />
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export default function StudentDiscussionsPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPosts(await getCommunityFeed());
    } catch (err) {
      const message = errorMessage(err, 'Failed to load discussions');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newPost.trim();
    if (!content) return;
    setPosting(true);
    try {
      const created = await createCommunityPost({ content, type: 'DISCUSSION', visibility: 'ORG_ONLY' });
      setPosts((prev) => [created, ...prev]);
      setNewPost('');
      toast.success('Discussion posted!');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to post discussion'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Course Discussions" subtitle="Collaborate with your peers and teachers." />

      <Card padding="20px">
        <form onSubmit={handlePost} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            aria-label="Start a new discussion"
            placeholder="Start a new discussion..."
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: 8, resize: 'none', outline: 'none', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text-primary)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="primary" size="sm" disabled={posting || !newPost.trim()}>
              <Send size={14} style={{ marginRight: 6 }} /> {posting ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <LoadingState lines={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadFeed} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No discussions yet"
          description="Start the first discussion to get the conversation going."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
