import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { ChatClient } from './chat-client';

export const metadata: Metadata = { title: 'Chat' };
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [channels, conversations, members, settings] = await Promise.all([
    db.channel.findMany({
      where: { OR: [{ kind: 'PUBLIC' }, { members: { some: { userId: user.id } } }] },
      // Ordering is applied client-side so a pin toggle can re-sort without a
      // refetch; `pinned` is what it sorts on.
      orderBy: { slug: 'asc' },
      include: {
        _count: { select: { messages: true } },
        members: { where: { userId: user.id }, select: { id: true } },
      },
    }),
    db.conversation.findMany({
      where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
      orderBy: { updatedAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, role: true, avatarSeed: true, status: true } },
        recipient: { select: { id: true, name: true, role: true, avatarSeed: true, status: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { attachment: { select: { originalName: true } } },
        },
      },
    }),
    // Directory for starting a new DM.
    db.user.findMany({
      where: { status: 'APPROVED', id: { not: user.id } },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, role: true, avatarSeed: true },
    }),
    // Chat enforces the same upload ceiling the file route does.
    getSettings(),
  ]);

  const isModerator = user.role === 'ADMIN' || user.role === 'MODERATOR';

  // Unread counts are resolved before the first paint so the sidebar never
  // renders a frame with no badges and then jumps. Mirrors GET /api/chat/read.
  const keys = [
    ...channels.map((c) => `channel:${c.id}`),
    ...conversations.map((c) => `conversation:${c.id}`),
  ];
  const initialUnread: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));

  if (keys.length > 0) {
    // A joined string rather than a JS array parameter: `ANY($1::text[])` relies
    // on how Prisma serialises arrays, which cannot be checked without a live
    // database, and a failure here would take down the whole chat page. CUIDs
    // never contain a comma, so splitting on one is unambiguous.
    const keyList = keys.join(',');
    try {
      const rows = await db.$queryRaw<{ scope: string; scopeId: string; count: number }[]>`
        SELECT
          CASE WHEN m."channelId" IS NOT NULL THEN 'channel' ELSE 'conversation' END AS scope,
          COALESCE(m."channelId", m."conversationId") AS "scopeId",
          COUNT(*)::int AS count
        FROM "Message" m
        LEFT JOIN "ReadState" r
          ON r."userId" = ${user.id}::text
         AND r."scope" = CASE WHEN m."channelId" IS NOT NULL THEN 'channel' ELSE 'conversation' END
         AND r."scopeId" = COALESCE(m."channelId", m."conversationId")
        WHERE COALESCE(m."channelId", m."conversationId") = ANY(string_to_array(${keyList}, ','))
          AND m."senderId" <> ${user.id}::text
          AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
        GROUP BY 1, 2
      `;
      for (const row of rows) {
        const key = `${row.scope}:${row.scopeId}`;
        if (key in initialUnread) initialUnread[key] = row.count;
      }
    } catch (err) {
      // Badges are cosmetic. If this query fails the page must still render, so
      // fall back to no badges rather than 500-ing chat on a SQL detail.
      console.error('[chat] unread counts failed', err);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Group Chat</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Real-time channels and direct messages.
        </p>
      </header>

      <ChatClient
        currentUser={{ id: user.id, name: user.name, role: user.role, avatarSeed: user.avatarSeed }}
        channels={channels.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          topic: c.topic,
          kind: c.kind,
          pinned: c.pinned,
          joined: c.members.length > 0,
          messageCount: c._count.messages,
        }))}
        conversations={conversations.map((c) => ({
          id: c.id,
          participant: c.senderId === user.id ? c.recipient : c.sender,
          lastMessage: c.messages[0]
            ? {
                // A file sent with no caption would otherwise preview as blank.
                body:
                  c.messages[0].body ||
                  (c.messages[0].attachment
                    ? `📎 ${c.messages[0].attachment.originalName}`
                    : ''),
                createdAt: c.messages[0].createdAt.toISOString(),
                mine: c.messages[0].senderId === user.id,
              }
            : null,
        }))}
        members={members}
        canCreateChannels={isModerator}
        canPinChannels={user.role === 'ADMIN'}
        maxUploadMb={settings.maxUploadMb}
        initialUnread={initialUnread}
      />
    </div>
  );
}