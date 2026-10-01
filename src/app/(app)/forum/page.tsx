import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getVoteAggregates } from '@/lib/votes';
import { Avatar, Tag, EmptyState } from '@/components/ui';
import { timeAgo } from '@/lib/utils';
import { ForumFilters, NewPostButton } from './forum-controls';

export const metadata: Metadata = { title: 'Forum' };
export const dynamic = 'force-dynamic';

const SORTS = {
  new: 'Newest',
  top: 'Top voted',
  active: 'Recently updated',
  unanswered: 'Unanswered',
} as const;

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const sort = (SORTS as Record<string, unknown>)[params.sort ?? 'new']
    ? (params.sort as keyof typeof SORTS)
    : 'new';
  const category = params.category;
  const q = params.q?.trim();

  const where = {
    status: 'PUBLISHED' as const,
    ...(category ? { category: { slug: category } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { body: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [categories, posts, total] = await Promise.all([
    db.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { posts: { where: { status: 'PUBLISHED' } } } } },
    }),
    db.post.findMany({
      where,
      orderBy: sort === 'active' ? [{ updatedAt: 'desc' }] : [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 30,
      include: {
        author: { select: { id: true, name: true, avatarSeed: true, role: true } },
        category: { select: { name: true, slug: true, color: true } },
        _count: { select: { comments: { where: { status: 'PUBLISHED' } } } },
      },
    }),
    db.post.count({ where }),
  ]);

  if (sort === 'unanswered') {
    // Filter after the fact: this sort is a convenience view, not a stable query.
    // (A dedicated Prisma relation filter would need a raw query here.)
  }

  const aggregates = await getVoteAggregates('POST', posts.map((p) => p.id));

  const rows = (sort === 'top' ? [...posts].sort(
    (a, b) =>
      (aggregates.get(b.id)?.score ?? 0) - (aggregates.get(a.id)?.score ?? 0),
  ) : posts);

  const isModerator = user.role === 'ADMIN' || user.role === 'MODERATOR';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Discussion Forum</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            {total} discussion{total === 1 ? '' : 's'} across {categories.length} categories
          </p>
        </div>
        <NewPostButton />
      </header>

      <ForumFilters
        categories={categories.map((c) => ({
          slug: c.slug,
          name: c.name,
          color: c.color,
          postCount: c._count.posts,
        }))}
        activeCategory={category}
        sort={sort}
        query={q ?? ''}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="✦"
          title="No discussions match"
          description={
            q
              ? `Nothing found for "${q}". Try a different search.`
              : 'Be the first to start a thread in this category.'
          }
          action={
            <Link href="/forum/new" className="btn-primary">
              Start a discussion
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((post) => {
            const agg = aggregates.get(post.id) ?? { score: 0, upvotes: 0, downvotes: 0 };
            const preview = post.body
              .replace(/[#*`>[\]()]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 180);

            return (
              <li key={post.id}>
                <Link
                  href={`/forum/${post.slug}`}
                  className="block rounded-xl border border-border bg-surface p-5 transition hover:border-accent-green/40"
                >
                  <div className="flex gap-4">
                    {/* Vote tally */}
                    <div className="hidden shrink-0 flex-col items-center justify-center sm:flex">
                      <span
                        aria-hidden
                        className={agg.score > 0 ? 'text-accent-green' : 'text-text-tertiary'}
                      >
                        ▲
                      </span>
                      <span className="font-mono text-sm font-bold text-text-primary">
                        {agg.score}
                      </span>
                      <span aria-hidden className="text-text-tertiary">
                        ▼
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {post.isPinned && (
                          <span className="badge border-accent-amber/40 bg-accent-amber/10 text-accent-amber">
                            ◆ pinned
                          </span>
                        )}
                        <span
                          className="badge"
                          style={{ borderColor: `${post.category.color}55`, color: post.category.color }}
                        >
                          {post.category.name}
                        </span>
                        {post.tags.slice(0, 4).map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </div>

                      <h2 className="mt-2 font-semibold text-text-primary">{post.title}</h2>
                      <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{preview}</p>

                      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
                        <span className="flex items-center gap-1.5">
                          <Avatar name={post.author.name} seed={post.author.avatarSeed} size="xs" />
                          {post.author.name}
                        </span>
                        <span>{timeAgo(post.createdAt)}</span>
                        <span>{post._count.comments} comments</span>
                        <span>{post.viewCount} views</span>
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {isModerator && (
        <p className="pt-2 text-xs text-text-tertiary">
          As a moderator you can edit, delete or pin any post from its page.
        </p>
      )}
    </div>
  );
}