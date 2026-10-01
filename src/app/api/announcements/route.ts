import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember, requirePermission } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { announcementSchema } from '@/lib/validation';

/** GET /api/announcements — active broadcasts, newest first. */
export const GET = handler(async () => {
  await requireMember();

  const now = new Date();
  const announcements = await db.announcement.findMany({
    // Expired broadcasts drop out of the feed automatically.
    where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  return ok({ announcements });
});

/** POST /api/announcements — admin only. */
export const POST = handler(async (req: Request) => {
  const actor = await requirePermission('announcement:create');
  enforceRateLimit(limitKey(req, 'announcement:create', actor.id), 20, 60 * 60 * 1000);

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = announcementSchema.parse(body);

  const announcement = await db.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      pinned: input.pinned,
      expiresAt: input.expiresAt ?? null,
      authorId: actor.id,
    },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  return ok({ announcement }, 201);
});