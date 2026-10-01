import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireUser } from '@/lib/guards';
import { commentUpdateSchema } from '@/lib/validation';
import { can } from '@/lib/rbac';
import { audit, logModeration } from '@/lib/audit';

/** PATCH /api/comments/[id] */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.comment.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true },
    });
    if (!existing) throw ApiError.notFound('That comment does not exist.');

    if (existing.authorId !== actor.id && !can(actor.role, 'comment:delete:any')) {
      throw ApiError.forbidden('You can only edit your own comments.');
    }

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = commentUpdateSchema.parse(body);

    const comment = await db.comment.update({ where: { id }, data: { body: input.body } });

    await logModeration({
      actorId: actor.id,
      action: 'comment.edit',
      entityType: 'COMMENT',
      entityId: id,
      metadata: { byModerator: existing.authorId !== actor.id },
    });
    await audit({
      actorId: actor.id,
      action: 'comment.update',
      entityType: 'COMMENT',
      entityId: id,
    });

    return ok({ comment });
  },
);

/** DELETE /api/comments/[id] — soft delete so replies keep a valid parent. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.comment.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!existing) throw ApiError.notFound('That comment does not exist.');

    if (existing.authorId !== actor.id && !can(actor.role, 'comment:delete:any')) {
      throw ApiError.forbidden('You can only delete your own comments.');
    }

    await db.comment.update({ where: { id }, data: { status: 'HIDDEN' } });

    await logModeration({
      actorId: actor.id,
      action: 'comment.delete',
      entityType: 'COMMENT',
      entityId: id,
      metadata: { byAuthor: existing.authorId === actor.id },
    });
    await audit({
      actorId: actor.id,
      action: 'comment.delete',
      entityType: 'COMMENT',
      entityId: id,
    });

    return ok({ success: true });
  },
);