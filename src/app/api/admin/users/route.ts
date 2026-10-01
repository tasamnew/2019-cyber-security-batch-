import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { requireRole } from '@/lib/guards';
import { adminUserListQuerySchema } from '@/lib/validation';

/**
 * GET /api/admin/users
 * Filter by status (pending / approved / blocked), role, or search.
 */
export const GET = handler(async (req: Request) => {
  await requireRole('MODERATOR');

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = adminUserListQuerySchema.parse(params);

  const where: Prisma.UserWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [users, total, statusCounts] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.perPage,
      skip: (query.page - 1) * query.perPage,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        bio: true,
        avatarSeed: true,
        createdAt: true,
        lastLoginAt: true,
        // Never leak passwordHash or lockout internals to the client.
        _count: { select: { posts: true, comments: true, messages: true } },
      },
    }),
    db.user.count({ where }),
    db.user.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, BLOCKED: 0 };
  for (const row of statusCounts) counts[row.status] = row._count._all;

  return ok({
    users,
    counts,
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    },
  });
});