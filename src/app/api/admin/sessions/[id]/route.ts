import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireAdmin } from '@/lib/guards';
import { audit } from '@/lib/audit';

/**
 * DELETE /api/admin/sessions/[id] — revoke a session immediately.
 * Body may include `?all=true` with the user id in the path to revoke every
 * session belonging to that user.
 */
export const DELETE = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireAdmin();
    const { id } = await ctx.params;

    const revokeAll = new URL(req.url).searchParams.get('all') === 'true';

    if (revokeAll) {
      const target = await db.session.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!target) throw ApiError.notFound('That session does not exist.');

      const result = await db.session.deleteMany({ where: { userId: target.userId } });

      await audit({
        actorId: actor.id,
        action: 'admin.sessions.revoke_all',
        entityType: 'USER',
        entityId: target.userId,
        metadata: { revoked: result.count },
      });

      return ok({ revoked: result.count });
    }

    const session = await db.session.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!session) throw ApiError.notFound('That session does not exist.');

    await db.session.delete({ where: { id } });

    await audit({
      actorId: actor.id,
      action: 'admin.session.revoke',
      entityType: 'SESSION',
      entityId: id,
      metadata: { userId: session.userId },
    });

    return ok({ success: true });
  },
);