import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { assignmentUpdateSchema } from '@/lib/validation';
import { can } from '@/lib/rbac';
import { audit } from '@/lib/audit';

/**
 * PATCH/DELETE /api/assignments/[id]
 *
 * The shared board is collaborative: a member may move their own cards, and
 * moderators/admins may move anyone's. Admins additionally delete.
 */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const existing = await db.assignment.findUnique({
      where: { id },
      select: { id: true, ownerId: true, createdById: true },
    });
    if (!existing) throw ApiError.notFound('That assignment does not exist.');

    const isMine = existing.ownerId === actor.id || existing.createdById === actor.id;
    const isModerator = can(actor.role, 'assignment:update:any');

    if (!isMine && !isModerator) {
      throw ApiError.forbidden('You can only update your own assignments.');
    }

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = assignmentUpdateSchema.parse(body);

    // Reassigning is a broader action than editing your own card.
    if (input.ownerId !== undefined && input.ownerId !== null && !isModerator) {
      if (existing.ownerId !== actor.id) {
        throw ApiError.forbidden('Only moderators can reassign work to others.');
      }
    }

    const assignment = await db.assignment.update({
      where: { id },
      data: input,
      include: { owner: { select: { id: true, name: true, avatarSeed: true } } },
    });

    await audit({
      actorId: actor.id,
      action: 'assignment.update',
      entityType: 'ASSIGNMENT',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });

    return ok({ assignment });
  },
);

export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const existing = await db.assignment.findUnique({
      where: { id },
      select: { id: true, ownerId: true, createdById: true },
    });
    if (!existing) throw ApiError.notFound('That assignment does not exist.');

    const isMine = existing.ownerId === actor.id || existing.createdById === actor.id;
    if (!isMine && !can(actor.role, 'assignment:delete:any')) {
      throw ApiError.forbidden('You can only delete assignments you created.');
    }

    await db.assignment.delete({ where: { id } });

    await audit({
      actorId: actor.id,
      action: 'assignment.delete',
      entityType: 'ASSIGNMENT',
      entityId: id,
    });

    return ok({ success: true });
  },
);