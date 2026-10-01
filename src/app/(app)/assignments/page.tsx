import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { AssignmentsClient } from './assignments-client';

export const metadata: Metadata = { title: 'Assignments' };
export const dynamic = 'force-dynamic';

const COLUMNS = ['TODO', 'IN_PROGRESS', 'SUBMITTED', 'DONE'] as const;

export default async function AssignmentsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [assignments, members] = await Promise.all([
    db.assignment.findMany({
      // Null due dates sort last, then soonest deadline first.
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        owner: { select: { id: true, name: true, avatarSeed: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    db.user.findMany({
      where: { status: 'APPROVED' },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true },
    }),
  ]);

  const isModerator = can(user.role, 'assignment:update:any');
  const canCreate = can(user.role, 'assignment:create');

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Assignment Tracker</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Shared board for labs, assignments and deadlines. Claim a card to take ownership.
        </p>
      </header>

      <AssignmentsClient
        columns={COLUMNS}
        canCreate={canCreate}
        members={members}
        currentUserId={user.id}
        initialAssignments={assignments.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          courseCode: a.courseCode,
          type: a.type,
          status: a.status,
          dueAt: a.dueAt ? a.dueAt.toISOString() : null,
          ownerId: a.ownerId,
          owner: a.owner,
          createdBy: a.createdBy,
          canEdit:
            a.ownerId === user.id || a.createdById === user.id || isModerator,
          canDelete: isModerator || a.createdById === user.id,
        }))}
      />
    </div>
  );
}