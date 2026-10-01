import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';

const dev = process.env.NODE_ENV !== 'production';
// Cloud Run / App Hosting inject PORT and require binding to all interfaces;
// local dev keeps localhost so the origin is predictable for cookies.
const hostname = process.env.HOST ?? (dev ? 'localhost' : '0.0.0.0');
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Auth: verify the same session JWT the HTTP layer uses, then confirm the
// session row still exists. Socket connections cannot read httpOnly cookies
// from JS, so the client passes the token via `auth` and we treat it as
// untrusted input until it verifies against AUTH_SECRET + the Session table.
// ---------------------------------------------------------------------------

const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? '');

function readCookie(header, name) {
  if (!header) return null;
  const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function authenticateSocket(socket) {
  const cookieToken = readCookie(socket.handshake.headers?.cookie, 'cs_session');
  const providedToken = socket.handshake.auth?.token ?? cookieToken;
  if (!providedToken) return null;

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(providedToken, secret, {
      algorithms: ['HS256'],
    }));
  } catch {
    return null;
  }

  if (!claims?.sub || !claims?.sid) return null;

  // Server-side session check => immediate revocation support.
  const session = await prisma.session.findUnique({
    where: { id: String(claims.sid) },
    include: { user: { select: { id: true, name: true, role: true, status: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status === 'BLOCKED') return null;

  return {
    userId: session.user.id,
    name: session.user.name,
    role: session.user.role,
    status: session.user.status,
    channels: new Set(),
    conversations: new Set(),
  };
}

/** Only approved members may chat. */
function isApproved(data) {
  return data && (data.status === undefined || data.status === 'APPROVED');
}

await app.prepare();

const httpServer = createServer((req, res) => {
  handle(req, res, parse(req.url, true));
});

const io = new SocketIOServer(httpServer, {
  path: '/api/socket.io',
  cors: { origin: false }, // same-origin only; cookies are SameSite=Lax
  maxHttpBufferSize: 1e5, // chat messages are small
  pingTimeout: 25_000,
});

io.use(async (socket, next) => {
  const data = await authenticateSocket(socket);
  if (!data) return next(new Error('unauthorized'));
  if (!isApproved(data)) return next(new Error('forbidden'));
  socket.data = data;
  next();
});

const serializer = {
  id: (m) => m.id,
  body: (m) => m.body,
  type: (m) => m.type,
  createdAt: (m) => m.createdAt,
  sender: (m) => ({ id: m.sender.id, name: m.sender.name, role: m.sender.role }),
  channelId: (m) => m.channelId ?? null,
  conversationId: (m) => m.conversationId ?? null,
  editedAt: (m) => m.editedAt ?? null,
};

io.on('connection', (socket) => {
  const { userId } = socket.data;

  // --- Channels ---------------------------------------------------------
  socket.on('channel:join', async ({ channelId }, ack) => {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return ack?.({ ok: false, error: 'Channel not found.' });

    // Private channels require membership; public channels are joinable by any member.
    if (channel.kind === 'PRIVATE') {
      const member = await prisma.channelMember.findUnique({
        where: { userId_channelId: { userId, channelId } },
      });
      if (!member) return ack?.({ ok: false, error: 'You are not a member of this channel.' });
    }

    await socket.join(`channel:${channelId}`);
    socket.data.channels.add(channelId);
    await prisma.channelMember.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId },
      update: {},
    });

    const messages = await prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    socket.emit('channel:history', { channelId, messages: messages.reverse().map(serializer) });
    ack?.({ ok: true });
  });

  socket.on('channel:leave', async ({ channelId }, ack) => {
    await socket.leave(`channel:${channelId}`);
    socket.data.channels.delete(channelId);
    ack?.({ ok: true });
  });

  socket.on('channel:send', async ({ channelId, body }, ack) => {
    const text = String(body ?? '').trim().slice(0, 4000);
    if (!text) return ack?.({ ok: false, error: 'Message cannot be empty.' });
    if (!socket.data.channels.has(channelId)) {
      return ack?.({ ok: false, error: 'Join the channel first.' });
    }

    const message = await prisma.message.create({
      data: { body: text, channelId, senderId: userId, type: 'TEXT' },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    io.to(`channel:${channelId}`).emit('channel:message', serializer(message));
    // Also deliver to the sender's personal room so the client stays in sync
    // across tabs/devices.
    io.to(`user:${userId}`).emit('channel:message', serializer(message));
    ack?.({ ok: true, messageId: message.id });
  });

  socket.on('channel:typing', ({ channelId, typing }) => {
    socket.to(`channel:${channelId}`).emit('channel:typing', {
      channelId,
      userId,
      name: socket.data.name,
      typing: Boolean(typing),
    });
  });

  // --- Direct messages ---------------------------------------------------
  socket.on('conversation:join', async ({ conversationId }, ack) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { take: 50, orderBy: { createdAt: 'desc' },
        include: { sender: { select: { id: true, name: true, role: true } } } } },
    });

    if (!conversation) return ack?.({ ok: false, error: 'Conversation not found.' });
    if (conversation.senderId !== userId && conversation.recipientId !== userId) {
      return ack?.({ ok: false, error: 'You are not part of this conversation.' });
    }

    await socket.join(`conversation:${conversationId}`);
    socket.data.conversations.add(conversationId);

    socket.emit('channel:history', {
      channelId: conversationId,
      messages: conversation.messages.reverse().map(serializer),
    });
    ack?.({ ok: true });
  });

  socket.on('conversation:send', async ({ conversationId, body }, ack) => {
    const text = String(body ?? '').trim().slice(0, 4000);
    if (!text) return ack?.({ ok: false, error: 'Message cannot be empty.' });

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return ack?.({ ok: false, error: 'Conversation not found.' });
    if (conversation.senderId !== userId && conversation.recipientId !== userId) {
      return ack?.({ ok: false, error: 'You are not part of this conversation.' });
    }

    const message = await prisma.message.create({
      data: { body: text, conversationId, senderId: userId, type: 'TEXT' },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    io.to(`conversation:${conversationId}`).emit('conversation:message', serializer(message));
    ack?.({ ok: true, messageId: message.id });
  });

  socket.on('conversation:typing', ({ conversationId, typing }) => {
    socket.to(`conversation:${conversationId}`).emit('channel:typing', {
      channelId: conversationId,
      userId,
      name: socket.data.name,
      typing: Boolean(typing),
    });
  });

  // --- Presence ----------------------------------------------------------
  socket.on('presence:subscribe', async () => {
    await socket.join(`user:${userId}`);
    socket.broadcast.emit('presence:online', { userId });
  });

  // --- Message edit / delete ---------------------------------------------
  // Message edits persist to the DB and are re-broadcast so other clients that
  // join later see the corrected text.
  socket.on('message:edit', async ({ messageId, body }, ack) => {
    const text = String(body ?? '').trim().slice(0, 4000);
    if (!text) return ack?.({ ok: false, error: 'Message cannot be empty.' });

    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) return ack?.({ ok: false, error: 'Message not found.' });
    if (existing.senderId !== userId && socket.data.role !== 'ADMIN') {
      return ack?.({ ok: false, error: 'You can only edit your own messages.' });
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: { body: text, editedAt: new Date() },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    if (message.channelId) io.to(`channel:${message.channelId}`).emit('channel:message', serializer(message));
    if (message.conversationId) {
      io.to(`conversation:${message.conversationId}`).emit('conversation:message', serializer(message));
    }
    ack?.({ ok: true });
  });

  socket.on('message:delete', async ({ messageId }, ack) => {
    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) return ack?.({ ok: false, error: 'Message not found.' });
    if (existing.senderId !== userId && socket.data.role !== 'ADMIN') {
      return ack?.({ ok: false, error: 'You can only delete your own messages.' });
    }

    await prisma.message.delete({ where: { id: messageId } });
    if (existing.channelId) {
      io.to(`channel:${existing.channelId}`).emit('system:notice', {
        message: 'A message was deleted.',
      });
    }
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('presence:offline', { userId });
  });
});

httpServer.listen(port, () => {
  console.log(`\n  ▸ CS Hub ready on http://${hostname}:${port}`);
  console.log(`  ▸ Socket.io on path /api/socket.io\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await prisma.$disconnect();
    io.close();
    httpServer.close(() => process.exit(0));
  });
}