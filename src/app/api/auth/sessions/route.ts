import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/guards';

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