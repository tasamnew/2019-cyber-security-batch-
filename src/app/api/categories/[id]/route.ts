import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requirePermission } from '@/lib/guards';
import { categoryUpdateSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';

/** PATCH /api/categories/[id] — rename/recolour a category. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requirePermission('channel:create');
    const { id } = await ctx.params;

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = categoryUpdateSchema.parse(body);

    await db.category.update({ where: { id }, data: input });

    await audit({
      actorId: actor.id,
      action: 'category.update',
      entityType: 'Category',
      entityId: id,
      metadata: input,
    });

    return ok({ success: true });
  },
);

/**
 * DELETE /api/categories/[id]
 * Refuses while posts remain, so a category can never be dropped out from under
 * live discussions.
 */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requirePermission('channel:create');
    const { id } = await ctx.params;

    const count = await db.post.count({ where: { categoryId: id } });
    if (count > 0) {
      throw ApiError.conflict(
        `This category still holds ${count} post${count === 1 ? '' : 's'}. Move or delete them first.`,
      );
    }

    await db.category.delete({ where: { id } });

    await audit({
      actorId: actor.id,
      action: 'category.delete',
      entityType: 'Category',
      entityId: id,
    });

    return ok({ success: true });
  },
);