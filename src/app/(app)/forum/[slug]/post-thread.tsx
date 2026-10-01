'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/hooks/use-socket';
import { useToast } from '@/hooks/use-toast';
import { Avatar, RoleBadge, Spinner, Tag } from '@/components/ui';
import { Markdown } from '@/components/markdown';
import { timeAgo, cn } from '@/lib/utils';

interface CommentNode {
  id: string;
  body: string;
  score: number;
  myVote: number;
  createdAt: string;
  author: { id: string; name: string; role: string; avatarSeed: string };
  parentId: string | null;
  replies?: CommentNode[];
}

interface PostData {
  id: string;
  slug: string;
  title: string;
  body: string;
  tags: string[];
  isPinned: boolean;
  status: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  score: number;
  upvotes: number;
  downvotes: number;
  myVote: number;
  commentCount: number;
  canEdit: boolean;
  canDelete: boolean;
  author: { id: string; name: string; role: string; avatarSeed: string; bio?: string | null };
  category: { name: string; slug: string; color: string };
}

interface ReportDialogProps {
  targetType: 'POST' | 'COMMENT';
  targetId: string;
  onClose: () => void;
}

export function ReportDialog({ targetType, targetId, onClose }: ReportDialogProps) {
  const { push } = useToast();
  const [reason, setReason] = useState('SPAM');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        json: { targetType, targetId, reason, details: details || undefined },
      });
      push('Thanks. A moderator will take a look.', 'success');
      onClose();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not submit the report.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/80"
        onClick={onClose}
      />
      <form onSubmit={submit} className="card relative w-full max-w-md">
        <h2 className="text-lg font-semibold text-text-primary">Report to moderators</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Reports are anonymous to the author of the content.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="reason" className="label">
              Reason
            </label>
            <select
              id="reason"
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="SPAM">Spam</option>
              <option value="HARASSMENT">Harassment</option>
              <option value="OFF_TOPIC">Off topic</option>
              <option value="MALICIOUS_CONTENT">Malicious content</option>
              <option value="COPYRIGHT">Copyright</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="details" className="label">
              Details <span className="normal-case text-text-tertiary">(optional)</span>
            </label>
            <textarea
              id="details"
              rows={3}
              maxLength={500}
              className="input resize-y"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Spinner /> : 'Submit report'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function PostThread({ initialPost }: { initialPost: PostData }) {
  const router = useRouter();
  const { push } = useToast();

  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [voting, setVoting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(initialPost.body);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const data = await apiFetch<{ comments: CommentNode[] }>(
        `/api/posts/${initialPost.id}/comments`,
      );
      setComments(data.comments);
    } catch {
      push('Could not load comments.', 'error');
    } finally {
      setLoadingComments(false);
    }
  }, [initialPost.id, push]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function vote(targetType: 'POST' | 'COMMENT', id: string, value: 1 | -1) {
    if (voting) return;
    setVoting(true);
    try {
      const result = await apiFetch<{ score: number; myVote: number }>(
        `/api/${targetType === 'POST' ? 'posts' : 'comments'}/${id}/vote`,
        { method: 'POST', json: { value } },
      );

      if (targetType === 'POST') {
        setPost((p) => ({ ...p, score: result.score, myVote: result.myVote }));
      } else {
        const apply = (c: CommentNode): CommentNode => ({
          ...c,
          score: c.id === id ? result.score : c.score,
          myVote: c.id === id ? result.myVote : c.myVote,
          replies: c.replies?.map(apply),
        });
        setComments((prev) => prev.map(apply));
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Vote failed.', 'error');
    } finally {
      setVoting(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (draft.trim().length < 2) return;

    setPosting(true);
    try {
      const data = await apiFetch<{ comment: CommentNode }>(
        `/api/posts/${initialPost.id}/comments`,
        { method: 'POST', json: { body: draft, parentId: replyTo } },
      );

      if (replyTo) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyTo ? { ...c, replies: [...(c.replies ?? []), data.comment] } : c,
          ),
        );
      } else {
        setComments((prev) => [...prev, { ...data.comment, replies: [] }]);
      }

      setDraft('');
      setReplyTo(null);
      setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }));
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not post the comment.', 'error');
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit() {
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'PATCH', json: { body: editBody } });
      setPost((p) => ({ ...p, body: editBody }));
      setEditing(false);
      push('Post updated.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  }

  async function togglePin() {
    try {
      await apiFetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        json: { isPinned: !post.isPinned },
      });
      setPost((p) => ({ ...p, isPinned: !p.isPinned }));
      push(post.isPinned ? 'Unpinned.' : 'Pinned to the top of the forum.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not change pin state.', 'error');
    }
  }

  async function removePost() {
    if (!confirm('Delete this post? It will be hidden from the forum.')) return;
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      push('Post deleted.', 'success');
      router.push('/forum');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  async function removeComment(id: string) {
    if (!confirm('Delete this comment?')) return;
    try {
      await apiFetch(`/api/comments/${id}`, { method: 'DELETE' });
      setComments((prev) =>
        prev
          .filter((c) => c.id !== id)
          .map((c) => ({ ...c, replies: c.replies?.filter((r) => r.id !== id) })),
      );
      push('Comment deleted.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Post */}
      <article className="card">
        <div className="flex flex-wrap items-center gap-2">
          {post.isPinned && (
            <span className="badge border-accent-amber/40 bg-accent-amber/10 text-accent-amber">
              ◆ pinned
            </span>
          )}
          <Link
            href={`/forum?category=${post.category.slug}`}
            className="badge hover:opacity-80"
            style={{ borderColor: `${post.category.color}55`, color: post.category.color }}
          >
            {post.category.name}
          </Link>
          {post.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>

        <h1 className="mt-3 text-2xl font-bold text-text-primary">{post.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-border pb-4">
          <Avatar name={post.author.name} seed={post.author.avatarSeed} size="sm" showRing />
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
              {post.author.name}
              <RoleBadge role={post.author.role} />
            </p>
            <p className="text-xs text-text-tertiary">
              Posted {timeAgo(post.createdAt)} · {post.viewCount} views
            </p>
          </div>

          <div className="ml-auto flex gap-1">
            {post.canEdit && !editing && (
              <button onClick={() => setEditing(true)} className="btn-ghost px-3 py-1.5 text-xs">
                Edit
              </button>
            )}
            {post.canDelete && (
              <button onClick={removePost} className="btn-ghost px-3 py-1.5 text-xs text-accent-rose">
                Delete
              </button>
            )}
            <button
              onClick={() => setReporting(true)}
              className="btn-ghost px-3 py-1.5 text-xs"
              title="Report to moderators"
            >
              ⚑
            </button>
          </div>
        </div>

        {/* Moderator controls */}
        {(post.canEdit || post.canDelete) && (
          <div className="mt-3 flex gap-2">
            <button onClick={togglePin} className="btn-secondary px-3 py-1.5 text-xs">
              {post.isPinned ? 'Unpin' : 'Pin to top'}
            </button>
          </div>
        )}

        {editing ? (
          <div className="mt-4 space-y-3">
            <textarea
              rows={16}
              className="input resize-y font-mono text-sm"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="btn-primary px-4 py-2">
                Save changes
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditBody(post.body);
                }}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <Markdown content={post.body} className="mt-4" />
        )}
      </article>

      {/* Comments */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          {comments.length} comment{comments.length === 1 ? '' : 's'}
        </h2>

        {/* Composer */}
        <form onSubmit={submitComment} className="card space-y-3">
          {replyTo && (
            <div className="flex items-center justify-between rounded-lg bg-accent-cyan/10 px-3 py-2 text-xs text-accent-cyan">
              <span>Replying to a comment</span>
              <button type="button" onClick={() => setReplyTo(null)} className="hover:underline">
                cancel
              </button>
            </div>
          )}
          <textarea
            rows={4}
            required
            minLength={2}
            maxLength={20000}
            className="input resize-y"
            placeholder="Add a comment. Markdown is supported."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-tertiary">{draft.length}/20000</span>
            <button type="submit" className="btn-primary" disabled={posting || draft.trim().length < 2}>
              {posting ? <Spinner /> : 'Post comment'}
            </button>
          </div>
        </form>

        {loadingComments ? (
          <div className="flex justify-center py-8">
            <Spinner className="text-accent-green" />
          </div>
        ) : comments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-tertiary">
            No comments yet. Start the conversation.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} id={`comment-${comment.id}`}>
                <CommentItem
                  comment={comment}
                  onVote={vote}
                  onReply={(id) => {
                    setReplyTo(id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onDelete={removeComment}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {reporting && (
        <ReportDialog
          targetType="POST"
          targetId={post.id}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}

function CommentItem({
  comment,
  onVote,
  onReply,
  onDelete,
  depth = 0,
}: {
  comment: CommentNode;
  onVote: (t: 'COMMENT', id: string, v: 1 | -1) => void;
  onReply: (id: string) => void;
  onDelete: (id: string) => void;
  depth?: number;
}) {
  return (
    <div className={cn(depth > 0 && 'ml-5 border-l-2 border-border pl-4 sm:ml-8')}>
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <Avatar name={comment.author.name} seed={comment.author.avatarSeed} size="sm" />

          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-text-primary">{comment.author.name}</span>
              <RoleBadge role={comment.author.role} />
              <span className="text-xs text-text-tertiary">{timeAgo(comment.createdAt)}</span>
            </p>

            <Markdown content={comment.body} className="mt-2" />

            <div className="mt-3 flex items-center gap-2">
              <VoteButtons
                score={comment.score}
                myVote={comment.myVote}
                onVote={(v) => onVote('COMMENT', comment.id, v)}
              />
              <button
                onClick={() => onReply(comment.id)}
                className="text-xs text-text-tertiary hover:text-accent-cyan"
              >
                Reply
              </button>
              <button
                onClick={() => onDelete(comment.id)}
                className="text-xs text-text-tertiary hover:text-accent-rose"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {comment.replies?.map((reply) => (
        <div key={reply.id} className="mt-3">
          <CommentItem
            comment={reply}
            onVote={onVote}
            onReply={onReply}
            onDelete={onDelete}
            depth={depth + 1}
          />
        </div>
      ))}
    </div>
  );
}

function VoteButtons({
  score,
  myVote,
  onVote,
}: {
  score: number;
  myVote: number;
  onVote: (value: 1 | -1) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-secondary/60 px-1.5 py-0.5">
      <button
        onClick={() => onVote(1)}
        aria-label="Upvote"
        aria-pressed={myVote === 1}
        className={cn(
          'px-1.5 text-xs transition',
          myVote === 1 ? 'text-accent-green' : 'text-text-tertiary hover:text-accent-green',
        )}
      >
        ▲
      </button>
      <span className="min-w-[1.5rem] text-center font-mono text-xs font-bold text-text-primary">
        {score}
      </span>
      <button
        onClick={() => onVote(-1)}
        aria-label="Downvote"
        aria-pressed={myVote === -1}
        className={cn(
          'px-1.5 text-xs transition',
          myVote === -1 ? 'text-accent-rose' : 'text-text-tertiary hover:text-accent-rose',
        )}
      >
        ▼
      </button>
    </div>
  );
}