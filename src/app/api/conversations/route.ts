import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';

/**
 * GET/POST /api/conversations
 *
 * GET  — list the caller's DM threads with the last message and unread count.
 * POST — open (or reuse) a 1:1 thread with another member.
 */
export const GET = handler(async () => {
  const actor = await requireMember();

  const conversations = await db.conversation.findMany({
    where: { OR: [{ senderId: actor.id }, { recipientId: actor.id }] },
    orderBy: { updatedAt: 'desc' },
    include: {
      sender: { select: { id: true, name: true, role: true, avatarSeed: true, status: true } },
      recipient: { select: { id: true, name: true, role: true, avatarSeed: true, status: true } },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: { id: true, name: true } } },
      },
      _count: { select: { messages: true } },
    },
  });

  return ok({
    conversations: conversations.map((c) => {
      const other = c.senderId === actor.id ? c.recipient : c.sender;
      const last = c.messages[0] ?? null;
      return {
        id: c.id,
        participant: other,
        lastMessage: last,
        messageCount: c._count.messages,
        updatedAt: c.updatedAt,
      };
    }),
  });
});

export const POST = handler(async (req: Request) => {
  const actor = await requireMember();

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const recipientId = String((body as { recipientId?: unknown }).recipientId ?? '');
  if (!recipientId || recipientId === actor.id) {
    throw ApiError.badRequest('Choose another member to message.');
  }

  const recipient = await db.user.findUnique({
    where: { id: recipientId },
    select: { id: true, status: true },
  });
  if (!recipient) throw ApiError.notFound('That member does not exist.');
  if (recipient.status !== 'APPROVED') {
    throw ApiError.forbidden('You cannot message an unapproved account.');
  }

  // Store the pair in a fixed order so the unique constraint prevents duplicates.
  const [first, second] = [actor.id, recipient.id].sort();

  const conversation = await db.conversation.upsert({
    where: { senderId_recipientId: { senderId: first, recipientId: second } },
    create: { senderId: first, recipientId: second },
    update: {},
    include: {
      sender: { select: { id: true, name: true, role: true, avatarSeed: true } },
      recipient: { select: { id: true, name: true, role: true, avatarSeed: true } },
    },
  });

  return ok({ conversation }, 201);
});