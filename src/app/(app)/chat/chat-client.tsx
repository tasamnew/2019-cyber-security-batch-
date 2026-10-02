'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSocket, useSocketEvent, emitWithAck, apiFetch } from '@/hooks/use-socket';
import { useToast } from '@/hooks/use-toast';
import { Avatar, RoleBadge, Spinner, EmptyState } from '@/components/ui';
import { timeAgo, cn, formatBytes } from '@/lib/utils';
import { ACCEPT, uploadWithProgress, validateUploadCandidate } from '@/lib/upload';
import { roleAtLeast } from '@/lib/rbac';
import type { Role } from '@prisma/client';
import type { ChatAttachment, ChatMessagePayload } from '@/lib/socket-events';

interface Channel {
  id: string;
  slug: string;
  name: string;
  topic: string | null;
  kind: 'PUBLIC' | 'PRIVATE';
  pinned: boolean;
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
  canPinChannels,
  maxUploadMb,
}: {
  currentUser: { id: string; name: string; role: string; avatarSeed: string };
  channels: Channel[];
  conversations: Conversation[];
  members: Member[];
  canCreateChannels: boolean;
  canPinChannels: boolean;
  maxUploadMb: number;
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

  // Local copy so a pin toggle can re-sort without a refetch.
  const [channelList, setChannelList] = useState(channels);
  const [pinningId, setPinningId] = useState<string | null>(null);

  // Search results are tagged with the view and term that produced them, so a
  // slow response for one channel can never flash up in another.
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{
    viewId: string;
    term: string;
    rows: ChatMessagePayload[];
  } | null>(null);
  const [searching, setSearching] = useState(false);

  // Pinned channels get their own group; the rest stay alphabetical.
  const { pinnedChannels, otherChannels } = useMemo(() => {
    const byName = (a: Channel, b: Channel) => a.slug.localeCompare(b.slug);
    return {
      pinnedChannels: channelList.filter((c) => c.pinned).sort(byName),
      otherChannels: channelList.filter((c) => !c.pinned).sort(byName),
    };
  }, [channelList]);

  // Staged attachment, uploaded to /api/files/upload on send.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxBytes = maxUploadMb * 1024 * 1024;

  // Moderators can retract anyone's message; everyone else only their own.
  const isModerator = roleAtLeast(currentUser.role as Role, 'MODERATOR');

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
        // The route already returns the canonical chat payload, so there is no
        // second set of casts here to fall out of step with the server.
        setMessages((data.messages ?? []) as ChatMessagePayload[]);
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

  // Message search. Kept apart from the history fetch above so an empty box
  // never costs a second round trip, and debounced like the resources search.
  useEffect(() => {
    const term = query.trim();
    if (!view || !term) {
      setSearch(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    const timer = setTimeout(() => {
      const url =
        view.kind === 'channel'
          ? `/api/channels/${view.id}/messages?q=${encodeURIComponent(term)}`
          : `/api/conversations/${view.id}/messages?q=${encodeURIComponent(term)}`;

      fetch(url, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error('Search failed.');
          return (await res.json()) as { messages?: ChatMessagePayload[] };
        })
        .then((data) => setSearch({ viewId: view.id, term, rows: data.messages ?? [] }))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          push('Search failed.', 'error');
        })
        .finally(() => setSearching(false));
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [view, query, push]);

  // Results render only when they belong to the current view and term.
  const searchTerm = query.trim();
  const showingResults =
    search !== null && search.viewId === view?.id && search.term === searchTerm;
  const visibleMessages = showingResults ? search.rows : messages;

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

  // Someone (possibly another tab) retracted a message: drop it here too.
  useSocketEvent(
    'message:deleted',
    ({ messageId, conversationId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      // Clear the DM preview only when it was the last message of that thread.
      setConvoList((prev) =>
        prev.map((c) =>
          c.lastMessage && c.lastMessage.mine && conversationId === c.id
            ? { ...c, lastMessage: null }
            : c,
        ),
      );
    },
    socket,
  );

  /**
   * Retract a message over REST rather than the socket: the send path already
   * falls back to HTTP when the live connection is down, and undoing a post is
   * exactly when you least want to be stuck waiting on a reconnect.
   */
  async function removeMessage(message: ChatMessagePayload) {
    if (!confirm('Delete this message? This cannot be undone.')) return;

    const previous = messages;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));

    try {
      await apiFetch(`/api/messages/${message.id}`, { method: 'DELETE' });
    } catch (err) {
      setMessages(previous);
      push(err instanceof Error ? err.message : 'Could not delete the message.', 'error');
    }
  }

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

  function pickFile(candidate: File | null | undefined) {
    if (!candidate) return;
    const check = validateUploadCandidate(candidate, maxBytes);
    if (!check.ok) {
      push(check.message, 'error');
      return;
    }
    setPendingFile(candidate);
  }

  /** Admin-only; the server re-checks, this just keeps the UI responsive. */
  async function togglePin(channel: Channel) {
    if (pinningId) return;
    const next = !channel.pinned;
    setPinningId(channel.id);
    try {
      await apiFetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        json: { pinned: next },
      });
      setChannelList((prev) => prev.map((c) => (c.id === channel.id ? { ...c, pinned: next } : c)));
      push(next ? `#${channel.name} pinned.` : `#${channel.name} unpinned.`, 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not update the channel.', 'error');
    } finally {
      setPinningId(null);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if ((!body && !pendingFile) || !view || sending) return;

    setSending(true);
    setUploading(true);
    setUploadProgress(0);
    try {
      // Writes go over REST, never the socket. The socket only carries live
      // fanout, presence and typing. On a sleeping free-tier instance the
      // socket is the first thing to drop and the last to recover, so making
      // the send depend on an ack meant "Timed out. Check your connection."
      // and a message that only appeared minutes later. REST has one write
      // path, returns the new id, and cannot half-succeed; the broadcast that
      // follows arrives over the socket and is deduped by id below.
      const url =
        view.kind === 'channel'
          ? `/api/channels/${view.id}/messages`
          : `/api/conversations/${view.id}/messages`;

      // The file goes up first so the message can reference a real asset id.
      let attachmentId: string | undefined;
      if (pendingFile) {
        const form = new FormData();
        form.append('file', pendingFile);
        const uploaded = await uploadWithProgress(form, setUploadProgress);
        attachmentId = uploaded.file.id;
      }

      const data = await apiFetch<{ message: ChatMessagePayload }>(url, {
        method: 'POST',
        json: { body, attachmentId },
      });

      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message],
      );
      setDraft('');
      setPendingFile(null);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not send the message.', 'error');
    } finally {
      setSending(false);
      setUploading(false);
      setUploadProgress(0);
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
          {pinnedChannels.length > 0 && (
            <li className="px-3 pb-1 pt-2 text-[0.6rem] font-semibold uppercase tracking-wide text-text-tertiary">
              Pinned
            </li>
          )}
          {pinnedChannels.map((channel) => (
            <li key={channel.id}>
              <ChannelButton
                channel={channel}
                active={view?.kind === 'channel' && view.id === channel.id}
                icon="📌"
                onSelect={() =>
                  setView({ kind: 'channel', id: channel.id, name: channel.name, topic: channel.topic })
                }
              />
            </li>
          ))}

          {pinnedChannels.length > 0 && otherChannels.length > 0 && (
            <li className="px-3 pb-1 pt-3 text-[0.6rem] font-semibold uppercase tracking-wide text-text-tertiary">
              Channels
            </li>
          )}

          {otherChannels.map((channel) => (
            <li key={channel.id}>
              <ChannelButton
                channel={channel}
                active={view?.kind === 'channel' && view.id === channel.id}
                icon="#"
                onSelect={() =>
                  setView({ kind: 'channel', id: channel.id, name: channel.name, topic: channel.topic })
                }
              />
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
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-black/5"
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
                        : 'hover:bg-black/5',
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
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-text-primary">
                  {view.kind === 'channel' ? `# ${view.name}` : view.name}
                </h2>
                {view.kind === 'channel' && view.topic && (
                  <p className="truncate text-xs text-text-tertiary">{view.topic}</p>
                )}
              </div>
              {canPinChannels && view.kind === 'channel' && (
                <ChannelPinButton
                  channel={channelList.find((c) => c.id === view.id)}
                  busy={pinningId === view.id}
                  onToggle={togglePin}
                />
              )}
            </header>

            <div className="border-b border-border px-5 py-2">
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={100}
                  placeholder={`Search in ${view.kind === 'channel' ? `#${view.name}` : view.name}`}
                  aria-label="Search messages in this conversation"
                  className="input py-1.5 pr-8 text-xs"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-text-tertiary hover:text-text-primary"
                  >
                    ✕
                  </button>
                )}
              </div>
              {searchTerm && (
                <p className="mt-1 text-[0.65rem] text-text-tertiary">
                  {searching
                    ? 'Searching…'
                    : `${visibleMessages.length} result${
                        visibleMessages.length === 1 ? '' : 's'
                      } for “${searchTerm}”`}
                </p>
              )}
            </div>

            <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="text-accent-green" />
                </div>
              ) : searchTerm ? (
                searching ? (
                  <div className="flex justify-center py-8">
                    <Spinner className="text-accent-green" />
                  </div>
                ) : visibleMessages.length === 0 ? (
                  <EmptyState
                    icon="⌕"
                    title="No matches"
                    description={`Nothing here matches “${searchTerm}”.`}
                  />
                ) : (
                  visibleMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      mine={message.sender.id === currentUser.id}
                      canDelete={message.sender.id === currentUser.id || isModerator}
                      onDelete={() => removeMessage(message)}
                    />
                  ))
                )
              ) : messages.length === 0 ? (
                <EmptyState
                  icon="◈"
                  title="No messages yet"
                  description="Say hello and get the conversation started."
                />
              ) : (
                messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    mine={message.sender.id === currentUser.id}
                    canDelete={message.sender.id === currentUser.id || isModerator}
                    onDelete={() => removeMessage(message)}
                  />
                ))
              )}

              {typingNames.length > 0 && (
                <p className="text-xs italic text-text-tertiary">
                  {typingNames.length === 1 ? 'Someone is typing…' : 'People are typing…'}
                </p>
              )}
            </div>

            <form onSubmit={send} className="border-t border-border p-3">
              {pendingFile && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2">
                  <span aria-hidden>📎</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                    {pendingFile.name}
                    <span className="ml-1.5 text-text-tertiary">
                      {formatBytes(pendingFile.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    disabled={uploading}
                    className="rounded px-1 text-xs text-text-tertiary hover:text-accent-rose disabled:opacity-40"
                    aria-label="Remove attachment"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  id="chat-file"
                  type="file"
                  className="sr-only"
                  accept={ACCEPT}
                  onChange={(e) => {
                    pickFile(e.target.files?.[0]);
                    // Reset so re-picking the same file still fires onChange.
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title={`Attach a file (max ${maxUploadMb} MB)`}
                  aria-label="Attach a file"
                  className="btn-ghost shrink-0 px-2.5 disabled:opacity-40"
                >
                  📎
                </button>
                <input
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  maxLength={4000}
                  placeholder={
                    connected ? 'Type a message…' : 'Type a message (sending via HTTP)'
                  }
                  className="input"
                  aria-label="Message"
                />
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={sending || (!draft.trim() && !pendingFile)}
                >
                  {sending ? <Spinner /> : 'Send'}
                </button>
              </div>
              {uploading && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-accent-green transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[0.65rem] text-text-tertiary">
                    Uploading attachment… {uploadProgress}%
                  </p>
                </div>
              )}
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

/**
 * One attachment inside a bubble. Images preview inline; everything else is a
 * download card. Bytes are only ever reachable through /api/files/[id], which
 * re-checks the session, so the href is the id and nothing else.
 */
function Attachment({ attachment, mine }: { attachment: ChatAttachment; mine: boolean }) {
  const [broken, setBroken] = useState(false);
  const href = `/api/files/${attachment.id}`;
  const isImage = attachment.mimeType.startsWith('image/') && !broken;

  if (isImage) {
    return (
      <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          title={attachment.name}
          className="block overflow-hidden rounded-xl border border-border"
        >
          {/* Plain img on purpose: the bytes sit behind a session check, so the
              Next image optimiser would fetch them unauthenticated and 401. */}
          <img
            src={href}
            alt={attachment.name}
            onError={() => setBroken(true)}
            className="max-h-64 w-auto max-w-full object-contain"
          />
        </a>
      </div>
    );
  }

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <a
        href={href}
        download={attachment.name}
        className="flex max-w-xs items-center gap-2 rounded-xl border border-border bg-bg-secondary px-3 py-2 text-left transition hover:border-accent-green/50"
      >
        <span aria-hidden className="shrink-0 text-accent-green">
          {broken ? '⚠' : '📎'}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs text-text-primary">{attachment.name}</span>
          <span className="block text-[0.65rem] text-text-tertiary">
            {formatBytes(attachment.sizeBytes)}
          </span>
        </span>
      </a>
    </div>
  );
}

/** One row in the sidebar, shared by the pinned and unpinned groups. */
function ChannelButton({
  channel,
  active,
  icon,
  onSelect,
}: {
  channel: Channel;
  active: boolean;
  icon: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
        active ? 'bg-accent-green/10 text-accent-green' : 'text-text-secondary hover:bg-black/5',
      )}
    >
      <span aria-hidden className="text-xs">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
      {channel.kind === 'PRIVATE' && <span className="text-[0.6rem]">🔒</span>}
    </button>
  );
}

/** Admin-only pin toggle. Hidden entirely for anyone who cannot use it. */
function ChannelPinButton({
  channel,
  busy,
  onToggle,
}: {
  channel: Channel | undefined;
  busy: boolean;
  onToggle: (channel: Channel) => void;
}) {
  if (!channel) return null;
  return (
    <button
      type="button"
      onClick={() => onToggle(channel)}
      disabled={busy}
      aria-pressed={channel.pinned}
      title={channel.pinned ? 'Unpin this channel' : 'Pin this channel for everyone'}
      className={cn(
        'shrink-0 rounded-lg border px-2.5 py-1.5 text-xs transition disabled:opacity-40',
        channel.pinned
          ? 'border-accent-green/50 bg-accent-green/10 text-accent-green'
          : 'border-border text-text-tertiary hover:border-accent-green/40 hover:text-text-secondary',
      )}
    >
      📌
    </button>
  );
}

/** One message bubble, used by both the live list and search results. */
function MessageBubble({
  message,
  mine,
  canDelete,
  onDelete,
}: {
  message: ChatMessagePayload;
  mine: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className={cn('group flex gap-3', mine && 'flex-row-reverse')}>
      <Avatar name={message.sender.name} seed={message.sender.id} size="sm" />
      <div className={cn('min-w-0 max-w-[80%]', mine && 'text-right')}>
        <p className="mb-0.5 flex items-center gap-2 text-xs text-text-tertiary">
          <span className="text-text-secondary">{message.sender.name}</span>
          <RoleBadge role={message.sender.role} />
          <time dateTime={message.createdAt}>{timeAgo(message.createdAt)}</time>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Delete message"
              aria-label={`Delete message from ${message.sender.name}`}
              className="rounded px-1 text-xs text-text-tertiary opacity-0 transition hover:text-accent-rose focus-visible:opacity-100 group-hover:opacity-100"
            >
              ✕
            </button>
          )}
        </p>
        {message.attachment && <Attachment attachment={message.attachment} mine={mine} />}
        {message.body && (
          <div
            className={cn(
              'inline-block whitespace-pre-wrap break-words rounded-xl px-4 py-2 text-left text-sm',
              message.attachment ? 'mt-1.5' : '',
              mine ? 'bg-accent-green/10 text-text-primary' : 'bg-bg-secondary text-text-primary',
            )}
          >
            {message.body}
          </div>
        )}
        {message.editedAt && (
          <p className="mt-0.5 text-[0.65rem] text-text-tertiary">(edited)</p>
        )}
      </div>
    </div>
  );
}