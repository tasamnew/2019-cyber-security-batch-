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
  attachment?: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
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
    // Only the fields a bubble needs: sending the stored name or path would let
    // one member's browser fetch a file another member is not allowed to see.
    attachment: row.attachment
      ? {
          id: row.attachment.id,
          name: row.attachment.originalName,
          mimeType: row.attachment.mimeType,
          sizeBytes: row.attachment.sizeBytes,
        }
      : null,
  };
}

/**
 * The one query shape used wherever a Message is read or written, so the REST
 * reply and the socket broadcast can never drift apart.
 */
export const messageInclude = {
  sender: { select: { id: true, name: true, role: true, avatarSeed: true } },
  attachment: {
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
  },
} as const;

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

/**
 * Tell a specific user's open tabs that a count in their sidebar may have moved.
 *
 * The count itself is deliberately not sent: a client cannot know whether the
 * newcomer had already read the message, so any number computed in the browser
 * would be a guess. Instead the client refetches, which is correct after a
 * delete, an edit, or a message sent from a device whose socket was asleep.
 */
export function broadcastUnreadChanged(userIds: string[], scope: string, scopeId: string): void {
  const server = io();
  if (!server || userIds.length === 0) return;
  server.to(userIds.map((id) => `user:${id}`)).emit('chat:unread', { scope, scopeId });
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