import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requirePermission } from '@/lib/guards';
import { announcementSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';

/** PATCH/DELETE /api/announcements/[id] — admin only. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requirePermission('announcement:manage');
    const { id } = await ctx.params;

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = announcementSchema.partial().parse(body);

    const announcement = await db.announcement.update({
      where: { id },
      data: input,
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    await audit({
      actorId: actor.id,
      action: 'announcement.update',
      entityType: 'ANNOUNCEMENT',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });

    return ok({ announcement });
  },
);

export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requirePermission('announcement:manage');
    const { id } = await ctx.params;

    const existing = await db.announcement.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) throw ApiError.notFound('That announcement does not exist.');

    await db.announcement.delete({ where: { id } });

    await audit({
      actorId: actor.id,
      action: 'announcement.delete',
      entityType: 'ANNOUNCEMENT',
      entityId: id,
      metadata: { title: existing.title },
    });

    return ok({ success: true });
  },
);