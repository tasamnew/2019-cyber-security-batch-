'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket, useSocketEvent, emitWithAck } from '@/hooks/use-socket';
import { useToast } from '@/hooks/use-toast';
import { Avatar, RoleBadge, Spinner, EmptyState } from '@/components/ui';
import { timeAgo, cn } from '@/lib/utils';
import type { ChatMessagePayload } from '@/lib/socket-events';

interface Channel {
  id: string;
  slug: string;
  name: string;
  topic: string | null;
  kind: 'PUBLIC' | 'PRIVATE';
  joined: boolean;
  messageCount: number;
}

interface Conversation {
  id: string;
  participant: { id: string; name: string; role: string; avatarSeed: string; status: string };
  lastMessage: { body: string; createdAt: string; mine: boolean } | null;
}

interface Member {
  id: string;
  name: string;
  role: string;
  avatarSeed: string;
}

type View =
  | { kind: 'channel'; id: string; name: string; topic: string | null }
  | { kind: 'dm'; id: string; name: string };

/**
 * Chat UI: channels + DMs in one surface, backed by Socket.io with REST
 * fallback so the page still works if the socket is blocked or reconnecting.
 */
export function ChatClient({
  currentUser,
  channels,
  conversations,
  members,
  canCreateChannels,
}: {
  currentUser: { id: string; name: string; role: string; avatarSeed: string };
  channels: Channel[];
  conversations: Conversation[];
  members: Member[];
  canCreateChannels: boolean;
}) {
  const { socket, connected, error: socketError } = useSocket(true);
  const { push } = useToast();

  const [view, setView] = useState<View | null>(null);
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [showNewDm, setShowNewDm] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [convoList, setConvoList] = useState(conversations);
  const [connected_] = [connected];

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-select the first channel on mount.
  useEffect(() => {
    if (view || channels.length === 0) return;
    const first = channels[0];
    setView({ kind: 'channel', id: first.id, name: first.name, topic: first.topic });
  }, [channels, view]);

  // Load history over REST, then let the socket take over for live messages.
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    setLoading(true);

    const url =
      view.kind === 'channel'
        ? `/api/channels/${view.id}/messages?limit=50`
        : `/api/conversations/${view.id}/messages?limit=50`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows: ChatMessagePayload[] = (data.messages ?? []).map((m: Record<string, never>) => ({
          id: m.id as unknown as string,
          body: m.body as unknown as string,
          type: m.type as unknown as ChatMessagePayload['type'],
          createdAt: new Date(m.createdAt as unknown as string).toISOString(),
          sender: m.sender as unknown as ChatMessagePayload['sender'],
          channelId: (view.kind === 'channel' ? view.id : null) as string | null,
          conversationId: (view.kind === 'dm' ? view.id : null) as string | null,
          editedAt: (m.editedAt ?? null) as string | null,
        }));
        setMessages(rows);
      })
      .catch(() => push('Could not load message history.', 'error'))
      .finally(() => !cancelled && setLoading(false));

    // Join the socket room.
    const s = socket.current;
    if (s && connected_) {
      if (view.kind === 'channel') {
        emitWithAck(s, 'channel:join', { channelId: view.id });
      } else {
        emitWithAck(s, 'conversation:join', { conversationId: view.id });
      }
    }

    return () => {
      cancelled = true;
      const sock = socket.current;
      if (sock && connected_) {
        if (view.kind === 'channel') {
          emitWithAck(sock, 'channel:leave', { channelId: view.id });
        }
      }
    };
  }, [view, socket, connected_, push]);

  // Scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typingUsers]);

  const onIncoming = useCallback(
    (payload: ChatMessagePayload) => {
      if (!view) return;
      const matches =
        view.kind === 'channel'
          ? payload.channelId === view.id
          : payload.conversationId === view.id;
      if (!matches) return;

      setMessages((prev) =>
        prev.some((m) => m.id === payload.id) ? prev : [...prev, payload],
      );
    },
    [view],
  );

  const onConversationIncoming = useCallback(onIncoming, [onIncoming]);

  useSocketEvent('channel:message', onIncoming, socket);
  useSocketEvent('conversation:message', onConversationIncoming, socket);

  useSocketEvent(
    'channel:typing',
    ({ channelId, userId, name, typing }) => {
      if (userId === currentUser.id) return;
      if (!view) return;
      const activeId = view.kind === 'channel' ? view.id : view.id;
      if (channelId !== activeId) return;
      setTypingUsers((prev) => ({ ...prev, [userId]: typing }));
    },
    socket,
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !view || sending) return;

    setSending(true);
    try {
      const s = socket.current;

      // Prefer the socket; fall back to REST so chat works while reconnecting.
      if (s && connected_) {
        const result =
          view.kind === 'channel'
            ? await emitWithAck(s, 'channel:send', { channelId: view.id, body })
            : await emitWithAck(s, 'conversation:send', { conversationId: view.id, body });

        if (!result.ok) throw new Error(result.error ?? 'Could not send the message.');

        // The broadcast echoes back, but for DMs sent from another tab the
        // personal room may not include us — optimistic append as a fallback.
        if (view.kind === 'dm') {
          setMessages((prev) => {
            if (prev.some((m) => m.id === result.messageId)) return prev;
            return [
              ...prev,
              {
                id: result.messageId ?? `pending-${Date.now()}`,
                body,
                type: 'TEXT',
                createdAt: new Date().toISOString(),
                sender: {
                  id: currentUser.id,
                  name: currentUser.name,
                  role: currentUser.role,
                },
                conversationId: view.id,
              },
            ];
          });
        }
      } else {
        const url =
          view.kind === 'channel'
            ? `/api/channels/${view.id}/messages`
            : `/api/conversations/${view.id}/messages`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? 'Could not send the message.');
        setMessages((prev) => [...prev, data.message]);
      }

      setDraft('');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not send the message.', 'error');
    } finally {
      setSending(false);
    }
  }

  function onDraftChange(value: string) {
    setDraft(value);

    const s = socket.current;
    if (s && connected_ && view) {
      const key = view.kind === 'channel' ? 'channel:typing' : 'conversation:typing';
      if (key === 'channel:typing') {
        s.emit('channel:typing', { channelId: view.id, typing: true });
      } else {
        s.emit('conversation:typing', { conversationId: view.id, typing: true });
      }

      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        if (!socket.current || !view) return;
        if (key === 'channel:typing') {
          socket.current.emit('channel:typing', { channelId: view.id, typing: false });
        } else {
          socket.current.emit('conversation:typing', { conversationId: view.id, typing: false });
        }
      }, 2000);
    }
  }

  async function startDm(memberId: string) {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: memberId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not open the conversation.');

      const other = members.find((m) => m.id === memberId);
      const entry: Conversation = {
        id: data.conversation.id,
        participant: {
          id: memberId,
          name: other?.name ?? 'Member',
          role: other?.role ?? 'STUDENT',
          avatarSeed: other?.avatarSeed ?? memberId,
          status: 'APPROVED',
        },
        lastMessage: null,
      };

      setConvoList((prev) => [entry, ...prev.filter((c) => c.id !== entry.id)]);
      setView({ kind: 'dm', id: entry.id, name: entry.participant.name });
      setShowNewDm(false);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not open the conversation.', 'error');
    }
  }

  const filteredMembers = members.filter(
    (m) =>
      !convoList.some((c) => c.participant.id === m.id) &&
      m.name.toLowerCase().includes(dmSearch.toLowerCase()),
  );

  const typingNames = Object.entries(typingUsers)
    .filter(([, v]) => v)
    .map(([id]) => currentUser.id === id ? '' : 'someone');

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      {/* Sidebar */}
      <aside className="card flex max-h-[38rem] flex-col overflow-hidden p-0 lg:max-h-[calc(100vh-14rem)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            Channels
            {canCreateChannels && <span className="text-[0.6rem] text-text-tertiary">mod+</span>}
          </span>
          <span
            className={cn(
              'flex items-center gap-1.5 text-[0.65rem]',
              connected ? 'text-accent-green' : 'text-accent-amber',
            )}
            title={socketError ?? (connected ? 'Live connection active' : 'Reconnecting…')}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-accent-green' : 'bg-accent-amber')} />
            {connected ? 'live' : 'offline'}
          </span>
        </div>

        <ul className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {channels.map((channel) => (
            <li key={channel.id}>
              <button
                onClick={() =>
                  setView({ kind: 'channel', id: channel.id, name: channel.name, topic: channel.topic })
                }
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                  view?.kind === 'channel' && view.id === channel.id
                    ? 'bg-accent-green/10 text-accent-green'
                    : 'text-text-secondary hover:bg-white/5',
                )}
              >
                <span aria-hidden className="text-xs">
                  #
                </span>
                <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                {channel.kind === 'PRIVATE' && <span className="text-[0.6rem]">🔒</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t border-border">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Direct messages
            </span>
            <button
              onClick={() => setShowNewDm((v) => !v)}
              aria-label="Start a direct message"
              className="text-accent-cyan"
            >
              +
            </button>
          </div>

          {showNewDm && (
            <div className="border-y border-border bg-bg-secondary/60 p-2">
              <input
                autoFocus
                className="input mb-2 py-1.5 text-xs"
                placeholder="Search members…"
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
              />
              <ul className="scrollbar-thin max-h-40 overflow-y-auto">
                {filteredMembers.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-text-tertiary">No members found.</li>
                ) : (
                  filteredMembers.map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => startDm(m.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/5"
                      >
                        <Avatar name={m.name} seed={m.avatarSeed} size="xs" />
                        <span className="truncate text-text-secondary">{m.name}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          <ul className="scrollbar-thin max-h-56 overflow-y-auto p-2">
            {convoList.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-text-tertiary">
                No direct messages yet.
              </li>
            ) : (
              convoList.map((convo) => (
                <li key={convo.id}>
                  <button
                    onClick={() =>
                      setView({ kind: 'dm', id: convo.id, name: convo.participant.name })
                    }
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition',
                      view?.kind === 'dm' && view.id === convo.id
                        ? 'bg-accent-green/10'
                        : 'hover:bg-white/5',
                    )}
                  >
                    <Avatar name={convo.participant.name} seed={convo.participant.avatarSeed} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">
                        {convo.participant.name}
                      </span>
                      {convo.lastMessage && (
                        <span className="block truncate text-[0.7rem] text-text-tertiary">
                          {convo.lastMessage.mine ? 'you: ' : ''}
                          {convo.lastMessage.body.slice(0, 40)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </aside>

      {/* Message pane */}
      <section className="card flex h-[calc(100vh-16rem)] min-h-[30rem] flex-col overflow-hidden p-0 lg:h-[calc(100vh-14rem)]">
        {!view ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState icon="▶" title="Pick a channel to start chatting" />
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-text-primary">
                  {view.kind === 'channel' ? `# ${view.name}` : view.name}
                </h2>
                {view.kind === 'channel' && view.topic && (
                  <p className="truncate text-xs text-text-tertiary">{view.topic}</p>
                )}
              </div>
            </header>

            <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="text-accent-green" />
                </div>
              ) : messages.length === 0 ? (
                <EmptyState
                  icon="◈"
                  title="No messages yet"
                  description="Say hello and get the conversation started."
                />
              ) : (
                messages.map((message) => {
                  const mine = message.sender.id === currentUser.id;
                  return (
                    <div
                      key={message.id}
                      className={cn('flex gap-3', mine && 'flex-row-reverse')}
                    >
                      <Avatar name={message.sender.name} seed={message.sender.id} size="sm" />
                      <div className={cn('min-w-0 max-w-[80%]', mine && 'text-right')}>
                        <p className="mb-0.5 flex items-center gap-2 text-xs text-text-tertiary">
                          <span className="text-text-secondary">{message.sender.name}</span>
                          <RoleBadge role={message.sender.role} />
                          <time dateTime={message.createdAt}>{timeAgo(message.createdAt)}</time>
                        </p>
                        <div
                          className={cn(
                            'inline-block whitespace-pre-wrap break-words rounded-xl px-4 py-2 text-left text-sm',
                            mine
                              ? 'bg-accent-green/10 text-text-primary'
                              : 'bg-bg-secondary text-text-primary',
                          )}
                        >
                          {message.body}
                        </div>
                        {message.editedAt && (
                          <p className="mt-0.5 text-[0.65rem] text-text-tertiary">(edited)</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {typingNames.length > 0 && (
                <p className="text-xs italic text-text-tertiary">
                  {typingNames.length === 1 ? 'Someone is typing…' : 'People are typing…'}
                </p>
              )}
            </div>

            <form onSubmit={send} className="border-t border-border p-3">
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  maxLength={4000}
                  placeholder={connected ? 'Type a message…' : 'Type a message (sending via HTTP)'}
                  className="input"
                  aria-label="Message"
                />
                <button type="submit" className="btn-primary" disabled={sending || !draft.trim()}>
                  {sending ? <Spinner /> : 'Send'}
                </button>
              </div>
              {!connected && (
                <p className="mt-1.5 text-[0.65rem] text-accent-amber">
                  Live connection unavailable — messages will send over HTTP until it recovers.
                </p>
              )}
            </form>
          </>
        )}
      </section>
    </div>
  );
}