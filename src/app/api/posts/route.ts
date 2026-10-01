import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requirePermission } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { postListQuerySchema, postCreateSchema } from '@/lib/validation';
import { getVoteAggregates, getUserVotes } from '@/lib/votes';
import { slugify } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/posts
 *
 * Supports category filter, full-text-ish search, and four sort orders.
 * Search uses a case-insensitive `contains` on title/body — fine at this
 * group's data volume; swap for Postgres FTS if the corpus grows.
 */
export const GET = handler(async (req: Request) => {
  const user = await getCurrentUser();
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = postListQuerySchema.parse(params);

  // Signed-out / not-approved visitors only ever see published posts.
  const isMember = user?.status === 'APPROVED';
  const role = user?.role;

  const where: Prisma.PostWhereInput = {
    status: 'PUBLISHED',
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.authorId ? { authorId: query.authorId } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { body: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // "top" and "unanswered" need data we do not have in SQL (vote totals,
  // comment counts), so they are filtered/scored after the query runs.
  const orderBy: Prisma.PostOrderByWithRelationInput[] =
    query.sort === 'active'
      ? [{ updatedAt: 'desc' }]
      : [{ isPinned: 'desc' }, { createdAt: 'desc' }];

  // "unanswered" narrows the SQL predicate to posts with no published comments.
  if (query.sort === 'unanswered') {
    where.comments = { none: { status: 'PUBLISHED' } };
  }

  const [posts, total] = await Promise.all([
    db.post.findMany({
      where,
      orderBy,
      take: query.perPage,
      skip: (query.page - 1) * query.perPage,
      include: {
        author: { select: { id: true, name: true, role: true, avatarSeed: true } },
        category: { select: { id: true, slug: true, name: true, color: true } },
        _count: { select: { comments: { where: { status: 'PUBLISHED' } } } },
      },
    }),
    db.post.count({ where }),
  ]);

  const ids = posts.map((p) => p.id);
  const [aggregates, votes] = await Promise.all([
    getVoteAggregates('POST', ids),
    user ? getUserVotes(user.id, 'POST', ids) : Promise.resolve(new Map<string, number>()),
  ]);

  // "top" is scored in memory from the aggregated vote totals.
  let rows = posts.map((p) => {
    const agg = aggregates.get(p.id) ?? { score: 0, upvotes: 0, downvotes: 0 };
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      body: p.body,
      isPinned: p.isPinned,
      viewCount: p.viewCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      author: p.author,
      category: p.category,
      commentCount: p._count.comments,
      tags: p.tags,
      score: agg.score,
      upvotes: agg.upvotes,
      downvotes: agg.downvotes,
      myVote: votes.get(p.id) ?? 0,
      canEdit:
        Boolean(isMember) &&
        (p.author.id === user?.id ||
          role === 'ADMIN' ||
          role === 'MODERATOR'),
    };
  });

  if (query.sort === 'top') {
    rows = rows.sort((a, b) => b.score - a.score);
  }

  return ok({
    posts: rows,
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    },
  });
});

/** POST /api/posts — create a thread. Approved students and moderators only. */
export const POST = handler(async (req: Request) => {
  const actor = await requirePermission('post:create');

  enforceRateLimit(limitKey(req, 'post:create', actor.id), 10, 60 * 60 * 1000);

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = postCreateSchema.parse(body);

  const category = await db.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.badRequest('Choose a valid category.');

  const post = await db.post.create({
    data: {
      title: input.title,
      body: input.body,
      slug: slugify(input.title),
      categoryId: input.categoryId,
      authorId: actor.id,
      tags: input.tags,
    },
    include: {
      author: { select: { id: true, name: true, role: true, avatarSeed: true } },
      category: { select: { id: true, slug: true, name: true, color: true } },
    },
  });

  return ok({ post }, 201);
});