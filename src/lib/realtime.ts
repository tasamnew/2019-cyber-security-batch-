import type { Server as SocketIOServer } from 'socket.io';
import type { ChatMessagePayload } from '@/lib/socket-events';

/**
 * Bridge from the HTTP layer to the live Socket.io server.
 *
 * server.mjs runs Next and Socket.io in one process, so it publishes the
 * instance on globalThis and route handlers can reach it. When the app is
 * hosted by a platform that runs the Next adapter instead (no custom server)
 * the global is absent and every broadcast is a no-op — chat still works, it
 * just only updates on reload.
 */

declare global {
  var __csIo: SocketIOServer | undefined;
}

function io(): SocketIOServer | undefined {
  return globalThis.__csIo;
}

/** Shape Prisma hands back for a Message row. */
export interface MessageRow {
  id: string;
  body: string;
  type: ChatMessagePayload['type'];
  channelId?: string | null;
  conversationId?: string | null;
  createdAt: Date;
  editedAt?: Date | null;
  sender: { id: string; name: string; role: string };
}

/**
 * Prisma returns real Date objects, but everything on the wire — and the
 * client-side contract — is ISO strings. Normalise once, here.
 */
export function toChatPayload(row: MessageRow): ChatMessagePayload {
  return {
    id: row.id,
    body: row.body,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    sender: { id: row.sender.id, name: row.sender.name, role: row.sender.role },
    channelId: row.channelId ?? null,
    conversationId: row.conversationId ?? null,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
  };
}

export function broadcastToChannel(channelId: string, message: ChatMessagePayload): void {
  io()?.to(`channel:${channelId}`).emit('channel:message', message);
  // The sender's personal room keeps their other tabs in sync.
  io()?.to(`user:${message.sender.id}`).emit('channel:message', message);
}

export function broadcastToConversation(
  conversationId: string,
  message: ChatMessagePayload,
): void {
  io()?.to(`conversation:${conversationId}`).emit('conversation:message', message);
}

export function broadcastDeletion(payload: {
  messageId: string;
  channelId?: string | null;
  conversationId?: string | null;
}): void {
  const server = io();
  if (!server) return;
  if (payload.channelId) server.to(`channel:${payload.channelId}`).emit('message:deleted', payload);
  if (payload.conversationId) {
    server.to(`conversation:${payload.conversationId}`).emit('message:deleted', payload);
  }
}