import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { requireAdmin } from '@/lib/guards';
import { paginationSchema } from '@/lib/validation';

/**
 * GET /api/admin/audit — the immutable administrative trail.
 * Also surfaces the moderation log so content actions appear in one timeline.
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { page, perPage } = paginationSchema.parse(params);
  const skip = (page - 1) * perPage;

  const [auditEntries, moderationEntries, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: perPage,
      skip,
      include: { actor: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    }),
    db.moderationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: perPage,
      skip,
      include: { actor: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    }),
    db.auditLog.count(),
  ]);

  return ok({
    entries: [...auditEntries, ...moderationEntries]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, perPage),
    pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  });
});