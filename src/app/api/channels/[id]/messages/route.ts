import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { messageCreateSchema } from '@/lib/validation';

/**
 * GET/POST /api/channels/[id]/messages
 *
 * Live delivery goes over Socket.io; this REST pair exists for history,
 * pagination, and the fallback path when the socket is down.
 */
export const GET = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const params = new URL(req.url).searchParams;
    const before = params.get('before'); // cursor: message id
    const limit = Math.min(Number(params.get('limit')) || 50, 100);

    const channel = await db.channel.findUnique({
      where: { id },
      select: { id: true, kind: true, name: true },
    });
    if (!channel) throw ApiError.notFound('That channel does not exist.');

    if (channel.kind === 'PRIVATE') {
      const member = await db.channelMember.findUnique({
        where: { userId_channelId: { userId: actor.id, channelId: id } },
      });
      if (!member) throw ApiError.forbidden('You are not a member of this channel.');
    }

    const where: Prisma.MessageWhereInput = {
      channelId: id,
      ...(before ? { id: { lt: before } } : {}),
    };

    // Newest first for pagination, then reverse for display order.
    const rows = await db.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sender: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    });

    return ok({
      messages: rows.reverse(),
      hasMore: rows.length === limit,
      channel: { id: channel.id, name: channel.name, kind: channel.kind },
    });
  },
);

/** POST — REST fallback for sending a message. */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = messageCreateSchema.parse(body);

    const channel = await db.channel.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!channel) throw ApiError.notFound('That channel does not exist.');

    if (channel.kind === 'PRIVATE') {
      const member = await db.channelMember.findUnique({
        where: { userId_channelId: { userId: actor.id, channelId: id } },
      });
      if (!member) throw ApiError.forbidden('You are not a member of this channel.');
    }

    // An attachment may only be used once, and only by whoever uploaded it.
    if (input.attachmentId) {
      const file = await db.fileAsset.findUnique({
        where: { id: input.attachmentId },
        select: { uploadedById: true },
      });
      if (!file) throw ApiError.badRequest('That attachment does not exist.');
      if (file.uploadedById !== actor.id && actor.role !== 'ADMIN') {
        throw ApiError.forbidden('You can only attach files you uploaded.');
      }
    }

    const message = await db.message.create({
      data: {
        body: input.body,
        channelId: id,
        senderId: actor.id,
        attachmentId: input.attachmentId ?? null,
        type: input.attachmentId ? 'FILE' : 'TEXT',
      },
      include: { sender: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    });

    return ok({ message }, 201);
  },
);