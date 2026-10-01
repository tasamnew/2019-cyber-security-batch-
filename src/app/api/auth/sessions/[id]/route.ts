import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireUser } from '@/lib/guards';
import { audit } from '@/lib/audit';

/** GET /api/auth/sessions — the caller's own active sessions. */
export const GET = handler(async () => {
  const actor = await requireUser();

  const sessions = await db.session.findMany({
    where: { userId: actor.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
  });

  return ok({ sessions });
});

/**
 * DELETE /api/auth/sessions/[id] — self-service sign-out of one of your own
 * sessions. Scoped to the caller so a member can never revoke someone else's.
 */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await ctx.params;

    const session = await db.session.findFirst({
      where: { id, userId: actor.id },
      select: { id: true },
    });
    if (!session) throw ApiError.notFound('That session does not exist.');

    await db.session.delete({ where: { id } });

    await audit({
      actorId: actor.id,
      action: 'user.session.revoked',
      entityType: 'SESSION',
      entityId: id,
    });

    return ok({ success: true });
  },
);