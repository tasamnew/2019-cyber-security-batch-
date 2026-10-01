import { db } from '@/lib/db';
import { requireAdminPage } from '../require-admin';
import { UsersClient } from './users-client';

export default async function AdminUsersPage() {
  const actor = await requireAdminPage();
  const isAdmin = actor.role === 'ADMIN';

  const [users, counts] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
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
        _count: { select: { posts: true, comments: true, messages: true } },
      },
    }),
    db.user.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const statusCounts: Record<string, number> = { PENDING: 0, APPROVED: 0, BLOCKED: 0 };
  for (const row of counts) statusCounts[row.status] = row._count._all;

  return (
    <UsersClient
      currentUserId={actor.id}
      canChangeRoles={isAdmin}
      initialCounts={statusCounts}
      initialUsers={users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      }))}
    />
  );
}