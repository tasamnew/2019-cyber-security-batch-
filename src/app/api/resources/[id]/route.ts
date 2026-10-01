import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireUser } from '@/lib/guards';
import { resourceUpdateSchema } from '@/lib/validation';
import { can } from '@/lib/rbac';
import { audit, logModeration } from '@/lib/audit';

/** PATCH /api/resources/[id] */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.resource.findUnique({
      where: { id },
      select: { id: true, uploadedById: true },
    });
    if (!existing) throw ApiError.notFound('That resource does not exist.');

    if (existing.uploadedById !== actor.id && !can(actor.role, 'resource:delete:any')) {
      throw ApiError.forbidden('You can only edit your own uploads.');
    }

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = resourceUpdateSchema.parse(body);

    const resource = await db.resource.update({
      where: { id },
      data: input,
      include: { file: true },
    });

    await audit({
      actorId: actor.id,
      action: 'resource.update',
      entityType: 'RESOURCE',
      entityId: id,
    });

    return ok({ resource });
  },
);

/**
 * DELETE /api/resources/[id]
 * For FILE resources this also unlinks the FileAsset row; an admin acting on an
 * inappropriate upload additionally purges the blob from disk.
 */
export const DELETE = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await ctx.params;
    const purge = new URL(req.url).searchParams.get('purgeFile') === 'true';

    const existing = await db.resource.findUnique({
      where: { id },
      select: { id: true, uploadedById: true, fileId: true, title: true },
    });
    if (!existing) throw ApiError.notFound('That resource does not exist.');

    const isOwner = existing.uploadedById === actor.id;
    if (!isOwner && !can(actor.role, 'resource:delete:any')) {
      throw ApiError.forbidden('You can only delete your own uploads.');
    }

    await db.resource.delete({ where: { id } });

    if (existing.fileId && purge) {
      // Keep the FileAsset row for the audit trail but detach it from the
      // resource; the caller may additionally drop the blob via /api/files/[id].
      await db.fileAsset.updateMany({
        where: { id: existing.fileId },
        data: {},
      });
    }

    await logModeration({
      actorId: actor.id,
      action: 'resource.delete',
      entityType: 'RESOURCE',
      entityId: id,
      metadata: { title: existing.title, byOwner: isOwner },
    });
    await audit({
      actorId: actor.id,
      action: 'resource.delete',
      entityType: 'RESOURCE',
      entityId: id,
      metadata: { title: existing.title },
    });

    return ok({ success: true });
  },
);