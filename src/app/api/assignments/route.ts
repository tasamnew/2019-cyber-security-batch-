import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember, requirePermission } from '@/lib/guards';
import { assignmentCreateSchema } from '@/lib/validation';
import { Prisma, type AssignmentStatus } from '@prisma/client';

/** GET /api/assignments — shared board, ordered by soonest due date. */
export const GET = handler(async (req: Request) => {
  const actor = await requireMember();
  const params = Object.fromEntries(new URL(req.url).searchParams);

  const status = params.status;
  const mineOnly = params.mine === 'true';

  const where: Prisma.AssignmentWhereInput = {
    ...(status && ['TODO', 'IN_PROGRESS', 'SUBMITTED', 'DONE'].includes(status)
      ? { status: status as AssignmentStatus }
      : {}),
    ...(mineOnly ? { ownerId: actor.id } : {}),
  };

  const [assignments, counts] = await Promise.all([
    db.assignment.findMany({
      where,
      // Null due dates sort last, then oldest first.
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        owner: { select: { id: true, name: true, avatarSeed: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    db.assignment.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const byStatus: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, SUBMITTED: 0, DONE: 0 };
  for (const row of counts) byStatus[row.status] = row._count._all;

  return ok({
    assignments: assignments.map((a) => ({
      ...a,
      canEdit:
        a.ownerId === actor.id ||
        a.createdById === actor.id ||
        actor.role === 'ADMIN' ||
        actor.role === 'MODERATOR',
    })),
    counts: byStatus,
  });
});

/** POST /api/assignments */
export const POST = handler(async (req: Request) => {
  const actor = await requirePermission('assignment:create');

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = assignmentCreateSchema.parse(body);

  // Verify the assignee exists so the board never points at a ghost user.
  if (input.ownerId) {
    const owner = await db.user.findUnique({
      where: { id: input.ownerId },
      select: { id: true },
    });
    if (!owner) throw ApiError.badRequest('That assignee does not exist.');
  }

  const assignment = await db.assignment.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      courseCode: input.courseCode ?? null,
      type: input.type,
      dueAt: input.dueAt ?? null,
      ownerId: input.ownerId ?? null,
      createdById: actor.id,
    },
    include: { owner: { select: { id: true, name: true, avatarSeed: true } } },
  });

  return ok({ assignment }, 201);
});