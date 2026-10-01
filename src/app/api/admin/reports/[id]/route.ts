import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireRole } from '@/lib/guards';
import { reportResolveSchema } from '@/lib/validation';
import { logModeration, audit } from '@/lib/audit';

/**
 * PATCH /api/admin/reports/[id]
 *
 * body: { status: 'RESOLVED' | 'DISMISSED', resolution?: string }
 *
 * Optional `action` lets a moderator apply the obvious fix in the same request:
 *   action: 'hide_post' | 'hide_comment' | 'remove_resource' | 'remove_file' | 'block_user'
 */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireRole('MODERATOR');
    const { id } = await ctx.params;

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = reportResolveSchema.parse(body);
    const action = (body as { action?: string }).action;

    const report = await db.report.findUnique({ where: { id } });
    if (!report) throw ApiError.notFound('That report does not exist.');

    if (report.status !== 'OPEN') {
      throw ApiError.conflict('That report has already been handled.');
    }

    // Apply the requested moderation action before closing the report.
    if (action) {
      await applyAction(action, report.targetType, report.targetId, actor);
    }

    const updated = await db.report.update({
      where: { id },
      data: {
        status: input.status,
        resolution: input.resolution ?? null,
        resolvedById: actor.id,
        resolvedAt: new Date(),
      },
      include: {
        reporter: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });

    await logModeration({
      actorId: actor.id,
      action: `report.${input.status.toLowerCase()}`,
      entityType: report.targetType,
      entityId: report.targetId,
      metadata: { reportId: id, reason: report.reason, resolution: input.resolution ?? null, action: action ?? null },
    });
    await audit({
      actorId: actor.id,
      action: 'admin.report.resolve',
      entityType: 'REPORT',
      entityId: id,
      metadata: { status: input.status, action: action ?? null, target: { type: report.targetType, id: report.targetId } },
      ip: (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()) ?? null,
    });

    return ok({ report: updated });
  },
);

/** Shared action applier so REST and UI paths stay consistent. */
async function applyAction(
  action: string,
  targetType: string,
  targetId: string,
  actor: { id: string; role: string },
): Promise<void> {
  switch (action) {
    case 'hide_post':
      await db.post.update({ where: { id: targetId }, data: { status: 'HIDDEN' } });
      await db.comment.updateMany({ where: { postId: targetId }, data: { status: 'HIDDEN' } });
      break;

    case 'hide_comment':
      await db.comment.update({ where: { id: targetId }, data: { status: 'HIDDEN' } });
      break;

    case 'remove_resource':
      await db.resource.delete({ where: { id: targetId } });
      break;

    case 'remove_file': {
      const { deleteStoredFile } = await import('@/lib/storage');
      const file = await db.fileAsset.findUnique({
        where: { id: targetId },
        select: { storedName: true },
      });
      if (file) await deleteStoredFile(file.storedName);
      await db.fileAsset.delete({ where: { id: targetId } });
      break;
    }

    case 'block_user': {
      // Only an admin may suspend an account, even from the queue.
      if (actor.role !== 'ADMIN') {
        throw ApiError.forbidden('Only an admin can block an account.');
      }
      const { logModeration: lm } = await import('@/lib/audit');
      await db.user.update({ where: { id: targetId }, data: { status: 'BLOCKED' } });
      await db.session.deleteMany({ where: { userId: targetId } });
      await lm({
        actorId: actor.id,
        action: 'user.status.blocked',
        entityType: 'USER',
        entityId: targetId,
        metadata: { via: 'moderation_queue' },
      });
      break;
    }

    default:
      throw ApiError.badRequest(`Unknown moderation action "${action}".`);
  }
}