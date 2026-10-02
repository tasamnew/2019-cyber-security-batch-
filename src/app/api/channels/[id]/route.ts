import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember, requirePermission } from '@/lib/guards';
import { channelUpdateSchema } from '@/lib/validation';
import { can } from '@/lib/rbac';
import { audit } from '@/lib/audit';

/**
 * POST /api/channels/[id]  body: { action: 'join' | 'leave' }
 *
 * Membership controls whether a member can read history in a private channel.
 * The Socket.io layer enforces the same rule when joining a room.
 */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const action = (body as { action?: string }).action ?? 'join';
    if (action !== 'join' && action !== 'leave') {
      throw ApiError.badRequest("action must be 'join' or 'leave'.");
    }

    const channel = await db.channel.findUnique({
      where: { id },
      select: { id: true, kind: true, name: true },
    });
    if (!channel) throw ApiError.notFound('That channel does not exist.');

    if (channel.kind === 'PRIVATE' && action === 'join') {
      const member = await db.channelMember.findUnique({
        where: { userId_channelId: { userId: actor.id, channelId: id } },
      });
      if (!member) {
        throw ApiError.forbidden('You have not been invited to this private channel.');
      }
      return ok({ joined: true });
    }

    if (action === 'join') {
      await db.channelMember.upsert({
        where: { userId_channelId: { userId: actor.id, channelId: id } },
        create: { userId: actor.id, channelId: id },
        update: {},
      });
    } else {
      await db.channelMember.deleteMany({ where: { userId: actor.id, channelId: id } });
    }

    return ok({ joined: action === 'join' });
  },
);

/** PATCH /api/channels/[id] — rename a channel, change its topic, or flip visibility. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requirePermission('channel:manage');
    const { id } = await ctx.params;

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });

    // Pinning is admin-only while the rest of this body is moderator-level, so
    // it is split out and gated on its own instead of living in
    // `channelUpdateSchema` where a moderator could set it by accident.
    const { pinned, ...rest } = body as { pinned?: unknown };
    const input = channelUpdateSchema.parse(rest);

    if (input.slug) {
      const clash = await db.channel.findUnique({ where: { slug: input.slug } });
      if (clash && clash.id !== id) {
        throw ApiError.conflict('Another channel already uses that slug.');
      }
    }

    let pinChange: boolean | undefined;
    if (pinned !== undefined) {
      if (typeof pinned !== 'boolean') {
        throw ApiError.badRequest('pinned must be true or false.');
      }
      if (!can(actor.role, 'channel:pin')) {
        throw ApiError.forbidden('Only an admin can pin a channel.');
      }
      pinChange = pinned;
    }

    const channel = await db.channel.update({
      where: { id },
      data: {
        ...input,
        // stamped on pin and cleared on unpin so "pinned since" stays honest
        ...(pinChange === undefined
          ? {}
          : { pinned: pinChange, pinnedAt: pinChange ? new Date() : null }),
      },
    });

    await audit({
      actorId: actor.id,
      action: pinChange === undefined ? 'channel.update' : 'channel.pin',
      entityType: 'Channel',
      entityId: id,
      metadata: pinChange === undefined ? input : { ...input, pinned: pinChange },
    });

    return ok({ channel });
  },
);

/**
 * DELETE /api/channels/[id]
 *
 * Refuses while messages remain so a course channel is never dropped out from
 * under a live conversation. Clear the history first.
 */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requirePermission('channel:manage');
    const { id } = await ctx.params;

    const channel = await db.channel.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { messages: true } } },
    });
    if (!channel) throw ApiError.notFound('That channel does not exist.');

    if (channel._count.messages > 0) {
      throw ApiError.conflict(
        `"${channel.name}" still holds ${channel._count.messages} message${
          channel._count.messages === 1 ? '' : 's'
        }. Delete them first, or archive the channel instead.`,
      );
    }

    await db.channel.delete({ where: { id } });

    await audit({
      actorId: actor.id,
      action: 'channel.delete',
      entityType: 'Channel',
      entityId: id,
      metadata: { name: channel.name },
    });

    return ok({ success: true });
  },
);