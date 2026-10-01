import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getVoteAggregates, getUserVotes } from '@/lib/votes';
import { can } from '@/lib/rbac';
import { PostThread } from './post-thread';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await db.post.findUnique({
    where: { slug },
    select: { title: true, status: true },
  });
  return { title: post && post.status === 'PUBLISHED' ? post.title : 'Post not found' };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const post = await db.post.findUnique({
    where: { slug },
    include: {
      author: { select: { id: true, name: true, role: true, avatarSeed: true, bio: true } },
      category: { select: { name: true, slug: true, color: true } },
      _count: { select: { comments: { where: { status: 'PUBLISHED' } } } },
    },
  });

  if (!post) notFound();

  // Hidden posts stay readable by their author (so they can edit or delete) and
  // by moderators (so they can review) — but not by anyone else.
  const privileged =
    post.author.id === user.id ||
    can(user.role, 'post:edit:any') ||
    user.role === 'ADMIN';
  if (post.status === 'HIDDEN' && !privileged) notFound();

  await db.post
    .update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);

  const [aggregates, votes] = await Promise.all([
    getVoteAggregates('POST', [post.id]),
    getUserVotes(user.id, 'POST', [post.id]),
  ]);
  const agg = aggregates.get(post.id) ?? { score: 0, upvotes: 0, downvotes: 0 };

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/forum?category=${post.category.slug}`}
        className="mb-4 inline-block text-xs text-text-tertiary hover:text-accent-cyan"
      >
        ← Back to {post.category.name}
      </Link>

      {post.status === 'HIDDEN' && (
        <div className="mb-4 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-4 py-3 text-sm text-accent-amber">
          This post is hidden from the forum. Only you and moderators can see it.
        </div>
      )}

      <PostThread
        initialPost={{
          id: post.id,
          slug: post.slug,
          title: post.title,
          body: post.body,
          tags: post.tags,
          isPinned: post.isPinned,
          status: post.status,
          viewCount: post.viewCount,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
          score: agg.score,
          upvotes: agg.upvotes,
          downvotes: agg.downvotes,
          myVote: votes.get(post.id) ?? 0,
          commentCount: post._count.comments,
          canEdit: post.author.id === user.id || can(user.role, 'post:edit:any'),
          canDelete: post.author.id === user.id || can(user.role, 'post:delete:any'),
          author: post.author,
          category: post.category,
        }}
      />
    </div>
  );
}