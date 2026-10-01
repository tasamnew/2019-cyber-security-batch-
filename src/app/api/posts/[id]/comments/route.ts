import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { commentCreateSchema, paginationSchema } from '@/lib/validation';
import { getVoteAggregates, getUserVotes } from '@/lib/votes';

/** GET /api/posts/[id]/comments — top-level comments, each with its replies. */
export const GET = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;
    const params = Object.fromEntries(new URL(req.url).searchParams);
    const { page, perPage } = paginationSchema.parse(params);

    const post = await db.post.findUnique({ where: { id }, select: { id: true } });
    if (!post) throw ApiError.notFound('That post does not exist.');

    const where: Prisma.CommentWhereInput = { postId: id, parentId: null, status: 'PUBLISHED' };
    // Moderators can read hidden comments to moderate them.
    if (actor.role === 'ADMIN' || actor.role === 'MODERATOR') delete where.status;

    const [comments, total] = await Promise.all([
      db.comment.findMany({
        where,
        orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
        take: perPage,
        skip: (page - 1) * perPage,
        include: {
          author: { select: { id: true, name: true, role: true, avatarSeed: true } },
          replies: {
            where: { status: 'PUBLISHED' },
            orderBy: { createdAt: 'asc' },
            include: {
              author: { select: { id: true, name: true, role: true, avatarSeed: true } },
            },
          },
        },
      }),
      db.comment.count({ where }),
    ]);

    // One flat id list for a single vote-aggregate query.
    const allIds = comments.flatMap((c) => [c.id, ...c.replies.map((r) => r.id)]);
    const [aggregates, votes] = await Promise.all([
      getVoteAggregates('COMMENT', allIds),
      getUserVotes(actor.id, 'COMMENT', allIds),
    ]);

    const decorate = (c: (typeof comments)[number]) => ({
      id: c.id,
      body: c.body,
      score: c.score,
      myVote: votes.get(c.id) ?? 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: c.author,
      parentId: c.parentId,
      replies: c.replies.map((r) => ({
        id: r.id,
        body: r.body,
        score: r.score,
        myVote: votes.get(r.id) ?? 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        author: r.author,
        parentId: r.parentId,
      })),
    });

    return ok({
      comments: comments.map(decorate),
      pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    });
  },
);

/** POST /api/posts/[id]/comments — new comment or threaded reply. */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    enforceRateLimit(limitKey(req, 'comment:create', actor.id), 30, 10 * 60 * 1000);

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = commentCreateSchema.parse(body);

    const post = await db.post.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!post || post.status === 'HIDDEN') throw ApiError.notFound('That post does not exist.');

    // A reply must point at a comment that belongs to this same post.
    if (input.parentId) {
      const parent = await db.comment.findUnique({
        where: { id: input.parentId },
        select: { postId: true },
      });
      if (!parent || parent.postId !== id) {
        throw ApiError.badRequest('That comment does not belong to this post.');
      }
    }

    const comment = await db.comment.create({
      data: {
        body: input.body,
        postId: id,
        authorId: actor.id,
        parentId: input.parentId ?? null,
      },
      include: { author: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    });

    return ok({ comment: { ...comment, myVote: 0, replies: [] } }, 201);
  },
);