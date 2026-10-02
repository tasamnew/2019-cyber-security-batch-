import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { z } from 'zod';

/**
 * GET  /api/chat/read  -> unread counts for every channel and DM
 * POST /api/chat/read  -> mark one conversation read up to now
 *
 * Counts are derived from `ReadState` rather than stored, so a count can never
 * drift out of sync with the messages it is counting.
 */

const markReadSchema = z.object({
  scope: z.enum(['channel', 'conversation']),
  scopeId: z.string().min(1),
});

const CHANNEL = 'channel' as const;
const CONVERSATION = 'conversation' as const;

interface UnreadRow {
  scope: string;
  scopeId: string;
  count: number;
}

export const GET = handler(async () => {
  const actor = await requireMember();

  const [channels, conversations] = await Promise.all([
    db.channel.findMany({
      where: { OR: [{ kind: 'PUBLIC' }, { members: { some: { userId: actor.id } } }] },
      select: { id: true },
    }),
    db.conversation.findMany({
      where: { OR: [{ senderId: actor.id }, { recipientId: actor.id }] },
      select: { id: true },
    }),
  ]);

  const channelIds = channels.map((c) => c.id);
  const conversationIds = conversations.map((c) => c.id);

  // One grouped count covering both scopes, joined against the read watermark
  // in SQL. Counting per conversation instead would be a query per channel,
  // which is the shape that falls over once someone is in a few dozen of them.
  const keys: string[] = [
    ...channelIds.map((id) => `${CHANNEL}:${id}`),
    ...conversationIds.map((id) => `${CONVERSATION}:${id}`),
  ];

  const unread: Record<string, number> = {};
  for (const key of keys) unread[key] = 0;
  if (keys.length === 0) return ok({ unread });

  // A joined string rather than a JS array parameter, so this does not depend on
  // how Prisma serialises arrays inside a raw query. CUIDs contain no commas.
  const keyList = keys.join(',');
  const rows = await db.$queryRaw<UnreadRow[]>`
    SELECT
      CASE WHEN m."channelId" IS NOT NULL THEN 'channel' ELSE 'conversation' END AS scope,
      COALESCE(m."channelId", m."conversationId") AS "scopeId",
      COUNT(*)::int AS count
    FROM "Message" m
    LEFT JOIN "ReadState" r
      ON r."userId" = ${actor.id}::text
     AND r."scope" = CASE WHEN m."channelId" IS NOT NULL THEN 'channel' ELSE 'conversation' END
     AND r."scopeId" = COALESCE(m."channelId", m."conversationId")
    WHERE COALESCE(m."channelId", m."conversationId") = ANY(string_to_array(${keyList}, ','))
      AND m."senderId" <> ${actor.id}::text
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
    GROUP BY 1, 2
  `;

  for (const row of rows) {
    const key = `${row.scope}:${row.scopeId}`;
    if (key in unread) unread[key] = row.count;
  }

  return ok({ unread });
});

export const POST = handler(async (req: Request) => {
  const actor = await requireMember();
  const body = markReadSchema.parse(await parseBody(req));

  // Confirm access before writing, so this cannot be used to probe which
  // channel or DM ids exist.
  if (body.scope === 'channel') {
    const channel = await db.channel.findUnique({
      where: { id: body.scopeId },
      select: { kind: true, members: { where: { userId: actor.id }, select: { id: true } } },
    });
    if (!channel) throw ApiError.notFound('Channel not found.');
    if (channel.kind === 'PRIVATE' && channel.members.length === 0) {
      throw ApiError.forbidden('You are not a member of this channel.');
    }
  } else {
    const conversation = await db.conversation.findFirst({
      where: {
        id: body.scopeId,
        OR: [{ senderId: actor.id }, { recipientId: actor.id }],
      },
      select: { id: true },
    });
    if (!conversation) throw ApiError.notFound('Conversation not found.');
  }

  await db.readState.upsert({
    where: {
      userId_scope_scopeId: {
        userId: actor.id,
        scope: body.scope,
        scopeId: body.scopeId,
      },
    },
    create: {
      userId: actor.id,
      scope: body.scope,
      scopeId: body.scopeId,
      lastReadAt: new Date(),
    },
    update: { lastReadAt: new Date() },
  });

  return ok({ scope: body.scope, scopeId: body.scopeId, unread: 0 });
});

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw ApiError.badRequest('Send a JSON body.');
  }
}
