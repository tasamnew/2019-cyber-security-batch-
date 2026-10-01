import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireUser } from '@/lib/guards';
import { postUpdateSchema } from '@/lib/validation';
import { getVoteAggregates, getUserVotes } from '@/lib/votes';
import { can } from '@/lib/rbac';
import { audit, logModeration } from '@/lib/audit';
import { ApiError as Err } from '@/lib/api-response';

/**
 * GET/PATCH/DELETE /api/posts/[id]
 *
 * The GET side increments viewCount but deliberately ignores failures so a
 * counter write can never break a page render.
 */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const user = await requireUser();

    const post = await db.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, role: true, avatarSeed: true, bio: true } },
        category: { select: { id: true, slug: true, name: true, color: true } },
        _count: { select: { comments: { where: { status: 'PUBLISHED' } } } },
      },
    });

    if (!post) throw ApiError.notFound('That post does not exist.');
    if (post.status === 'HIDDEN' && post.author.id !== user.id && !can(user.role, 'post:edit:any')) {
      throw ApiError.notFound('That post does not exist.');
    }

    await db.post
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    const [aggregates, votes] = await Promise.all([
      getVoteAggregates('POST', [id]),
      getUserVotes(user.id, 'POST', [id]),
    ]);
    const agg = aggregates.get(id) ?? { score: 0, upvotes: 0, downvotes: 0 };

    return ok({
      post: {
        ...post,
        score: agg.score,
        upvotes: agg.upvotes,
        downvotes: agg.downvotes,
        myVote: votes.get(id) ?? 0,
        commentCount: post._count.comments,
        canEdit: post.author.id === user.id || can(user.role, 'post:edit:any'),
        canDelete: post.author.id === user.id || can(user.role, 'post:delete:any'),
      },
    });
  },
);

/** PATCH /api/posts/[id] — author edit, or moderator edit of anything. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true },
    });
    if (!existing) throw ApiError.notFound('That post does not exist.');

    const isAuthor = existing.authorId === actor.id;
    if (!isAuthor && !can(actor.role, 'post:edit:any')) {
      throw Err.forbidden('You can only edit your own posts.');
    }

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = postUpdateSchema.parse(body);

    // Pinning is a moderator-only concern, separated from content edits.
    // Pinning and status are moderator-only concerns, kept out of the
    // author-editable payload so they cannot be smuggled through `input`.
    const extra = body as Record<string, unknown>;

    if (extra.isPinned !== undefined) {
      if (!can(actor.role, 'post:pin')) {
        throw Err.forbidden('Only moderators can pin posts.');
      }
      const pinned = Boolean(extra.isPinned);
      await db.post.update({ where: { id }, data: { isPinned: pinned } });
      await logModeration({
        actorId: actor.id,
        action: 'post.pin',
        entityType: 'POST',
        entityId: id,
        metadata: { isPinned: pinned },
      });
    }

    if (extra.status !== undefined && !can(actor.role, 'post:edit:any')) {
      throw Err.forbidden('Only moderators can change a post status.');
    }
    if (extra.status !== undefined) {
      await db.post.update({
        where: { id },
        data: { status: extra.status === 'HIDDEN' ? 'HIDDEN' : 'PUBLISHED' },
      });
    }

    const post = await db.post.update({
      where: { id },
      data: input as Prisma.PostUpdateInput,
      include: {
        author: { select: { id: true, name: true, role: true, avatarSeed: true } },
        category: { select: { id: true, slug: true, name: true, color: true } },
      },
    });

    await audit({
      actorId: actor.id,
      action: 'post.update',
      entityType: 'POST',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });

    return ok({ post });
  },
);

/**
 * DELETE /api/posts/[id]
 * Soft delete (status=HIDDEN) rather than destroying the row, so open reports
 * and the audit trail keep a valid reference. Messages are cascaded by Prisma.
 */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, title: true },
    });
    if (!existing) throw ApiError.notFound('That post does not exist.');

    const isAuthor = existing.authorId === actor.id;
    if (!isAuthor && !can(actor.role, 'post:delete:any')) {
      throw Err.forbidden('You can only delete your own posts.');
    }

    await db.$transaction([
      db.post.update({ where: { id }, data: { status: 'HIDDEN' } }),
      db.comment.updateMany({ where: { postId: id }, data: { status: 'HIDDEN' } }),
    ]);

    await logModeration({
      actorId: actor.id,
      action: 'post.delete',
      entityType: 'POST',
      entityId: id,
      metadata: { title: existing.title, byAuthor: isAuthor },
    });
    await audit({
      actorId: actor.id,
      action: 'post.delete',
      entityType: 'POST',
      entityId: id,
      metadata: { title: existing.title },
    });

    return ok({ success: true });
  },
);