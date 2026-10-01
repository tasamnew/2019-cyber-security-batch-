import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ChatClient } from './chat-client';

export const metadata: Metadata = { title: 'Chat' };
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [channels, conversations, members] = await Promise.all([
    db.channel.findMany({
      where: { OR: [{ kind: 'PUBLIC' }, { members: { some: { userId: user.id } } }] },
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
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    }),
    // Directory for starting a new DM.
    db.user.findMany({
      where: { status: 'APPROVED', id: { not: user.id } },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, role: true, avatarSeed: true },
    }),
  ]);

  const isModerator = user.role === 'ADMIN' || user.role === 'MODERATOR';

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
          joined: c.members.length > 0,
          messageCount: c._count.messages,
        }))}
        conversations={conversations.map((c) => ({
          id: c.id,
          participant: c.senderId === user.id ? c.recipient : c.sender,
          lastMessage: c.messages[0]
            ? {
                body: c.messages[0].body,
                createdAt: c.messages[0].createdAt.toISOString(),
                mine: c.messages[0].senderId === user.id,
              }
            : null,
        }))}
        members={members}
        canCreateChannels={isModerator}
      />
    </div>
  );
}