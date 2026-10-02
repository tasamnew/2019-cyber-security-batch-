/**
 * Socket.io event contract, shared by the custom server and the browser client.
 * Keeping this in one file means both sides fail to compile if a payload drifts.
 */

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  // Channel messages
  'channel:message': (payload: ChatMessagePayload) => void;
  'channel:history': (payload: { channelId: string; messages: ChatMessagePayload[] }) => void;
  // A message was retracted: clients drop it by id.
  'message:deleted': (payload: {
    messageId: string;
    channelId?: string | null;
    conversationId?: string | null;
  }) => void;
  // Direct messages
  'dm:message': (payload: ChatMessagePayload) => void;
  'conversation:message': (payload: ChatMessagePayload) => void;
  // A sidebar unread count may have moved; the client refetches rather than
  // guessing a number it cannot derive correctly.
  'chat:unread': (payload: { scope: string; scopeId: string }) => void;
  // Presence
  'presence:online': (payload: { userId: string }) => void;
  'presence:offline': (payload: { userId: string }) => void;
  'channel:typing': (payload: { channelId: string; userId: string; name: string; typing: boolean }) => void;
  // Generic system notice (e.g. announcement broadcast)
  'system:notice': (payload: { message: string }) => void;
  'error:message': (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  'channel:join': (payload: { channelId: string }, ack?: Ack) => void;
  'channel:leave': (payload: { channelId: string }, ack?: Ack) => void;
  'channel:send': (payload: { channelId: string; body: string }, ack?: Ack) => void;
  'channel:typing': (payload: { channelId: string; typing: boolean }) => void;
  'conversation:join': (payload: { conversationId: string }, ack?: Ack) => void;
  'conversation:send': (payload: { conversationId: string; body: string }, ack?: Ack) => void;
  'conversation:typing': (payload: { conversationId: string; typing: boolean }) => void;
  'presence:subscribe': () => void;
  'message:edit': (payload: { messageId: string; body: string }, ack?: Ack) => void;
  'message:delete': (payload: { messageId: string }, ack?: Ack) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  name: string;
  role: string;
  channels: Set<string>;
  conversations: Set<string>;
}

export type Ack = (response: { ok: boolean; error?: string; messageId?: string }) => void;

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessagePayload {
  id: string;
  body: string;
  type: 'TEXT' | 'SYSTEM' | 'FILE';
  createdAt: string;
  sender: { id: string; name: string; role: string };
  channelId?: string | null;
  conversationId?: string | null;
  editedAt?: string | null;
  attachment?: ChatAttachment | null;
}

// Room name helpers — both sides must build identical strings.
export const channelRoom = (channelId: string) => `channel:${channelId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
export const userRoom = (userId: string) => `user:${userId}`;