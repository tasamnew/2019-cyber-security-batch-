import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { requireRole } from '@/lib/guards';
import { paginationSchema } from '@/lib/validation';

/** GET /api/admin/sessions — active sessions, for revoking stolen logins. */
export const GET = handler(async (req: Request) => {
  const actor = await requireRole('ADMIN');

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { page, perPage } = paginationSchema.parse(params);

  const where = { ...(params.userId ? { userId: String(params.userId) } : {}) };

  const [sessions, total] = await Promise.all([
    db.session.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: perPage,
      skip: (page - 1) * perPage,
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, status: true, avatarSeed: true },
        },
      },
    }),
    db.session.count({ where }),
  ]);

  return ok({
    sessions: sessions.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      // Marks the caller's own session so the UI does not offer "revoke" on it.
      isCurrent: s.id === actor.sessionId,
      user: s.user,
    })),
    pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  });
});