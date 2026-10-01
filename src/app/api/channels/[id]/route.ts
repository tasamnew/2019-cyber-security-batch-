import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';

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