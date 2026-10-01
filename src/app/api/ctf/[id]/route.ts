import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { can } from '@/lib/rbac';
import { logModeration, audit } from '@/lib/audit';
import { ctfCreateSchema } from '@/lib/validation';

/** PATCH /api/ctf/[id] — creator or moderator. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const existing = await db.ctfChallenge.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
    if (!existing) throw ApiError.notFound('That challenge does not exist.');

    if (existing.createdById !== actor.id && !can(actor.role, 'ctf:manage:any')) {
      throw ApiError.forbidden('You can only edit challenges you posted.');
    }

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = ctfCreateSchema.partial().parse(body);

    const challenge = await db.ctfChallenge.update({ where: { id }, data: input });

    await audit({
      actorId: actor.id,
      action: 'ctf.update',
      entityType: 'CTF',
      entityId: id,
    });

    return ok({ challenge });
  },
);

/** DELETE /api/ctf/[id] */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const existing = await db.ctfChallenge.findUnique({
      where: { id },
      select: { id: true, createdById: true, title: true },
    });
    if (!existing) throw ApiError.notFound('That challenge does not exist.');

    if (existing.createdById !== actor.id && !can(actor.role, 'ctf:manage:any')) {
      throw ApiError.forbidden('You can only remove challenges you posted.');
    }

    await db.ctfChallenge.delete({ where: { id } });

    await logModeration({
      actorId: actor.id,
      action: 'ctf.delete',
      entityType: 'CTF',
      entityId: id,
      metadata: { title: existing.title },
    });
    await audit({
      actorId: actor.id,
      action: 'ctf.delete',
      entityType: 'CTF',
      entityId: id,
    });

    return ok({ success: true });
  },
);