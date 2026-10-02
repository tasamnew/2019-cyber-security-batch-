import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { messageCreateSchema } from '@/lib/validation';
import { broadcastToConversation, toChatPayload } from '@/lib/realtime';

/** GET/POST /api/conversations/[id]/messages — DM history + REST send fallback. */
export const GET = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const params = new URL(req.url).searchParams;
    const before = params.get('before');
    const limit = Math.min(Number(params.get('limit')) || 50, 100);

    const conversation = await db.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        senderId: true,
        recipientId: true,
        sender: { select: { id: true, name: true, avatarSeed: true } },
        recipient: { select: { id: true, name: true, avatarSeed: true } },
      },
    });
    if (!conversation) throw ApiError.notFound('That conversation does not exist.');

    // Membership check on every read — never trust the id alone.
    if (conversation.senderId !== actor.id && conversation.recipientId !== actor.id) {
      throw ApiError.forbidden('You are not part of this conversation.');
    }

    const where: Prisma.MessageWhereInput = {
      conversationId: id,
      ...(before ? { id: { lt: before } } : {}),
    };

    const rows = await db.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sender: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    });

    return ok({
      messages: rows.reverse(),
      hasMore: rows.length === limit,
      participant: conversation.senderId === actor.id ? conversation.recipient : conversation.sender,
    });
  },
);

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const conversation = await db.conversation.findUnique({
      where: { id },
      select: { id: true, senderId: true, recipientId: true },
    });
    if (!conversation) throw ApiError.notFound('That conversation does not exist.');
    if (conversation.senderId !== actor.id && conversation.recipientId !== actor.id) {
      throw ApiError.forbidden('You are not part of this conversation.');
    }

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = messageCreateSchema.parse(body);

    const message = await db.message.create({
      data: {
        body: input.body,
        conversationId: id,
        senderId: actor.id,
        type: 'TEXT',
      },
      include: { sender: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    });

    // Bump the thread so it floats to the top of the DM list.
    await db.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    // Sends are REST, so the live fanout is triggered here (see lib/realtime).
    broadcastToConversation(id, toChatPayload(message));

    return ok({ message }, 201);
  },
);