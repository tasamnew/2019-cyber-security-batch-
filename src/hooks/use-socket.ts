'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ChatMessagePayload,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/lib/socket-events';

/**
 * Socket.io client with the same typed contract as the server.
 *
 * The session cookie is httpOnly, so the browser cannot read the JWT to hand to
 * `auth.token`. The handshake therefore relies on the cookie the browser sends
 * automatically, which server.mjs verifies.
 */

type CSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket(enabled = true) {
  const socketRef = useRef<CSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const socket: CSocket = io({
      path: '/api/socket.io',
      // withCredentials so the httpOnly session cookie rides along.
      withCredentials: true,
      transports: ['websocket', 'polling'],
      // Socket.io >= 4.7 does not try the next transport after a failure unless
      // this is set: a rejected WebSocket upgrade left the client retrying
      // websocket forever, so it never connected and chat sat on the REST
      // fallback. Polling is what gets through proxies that block upgrades.
      tryAllTransports: true,
      // Keep retrying in the background. A free instance that sleeps drops the
      // socket, and the user should not have to reload to get it back.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
      socket.emit('presence:subscribe');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      setConnected(false);
      setError(err.message === 'unauthorized' ? 'Session expired. Sign in again.' : err.message);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  return { socket: socketRef, connected, error };
}

/**
 * Subscribe helper that keeps the handler stable across renders.
 * The listener is stored in a ref so inline arrow functions in components do not
 * cause a resubscribe on every render.
 */
export function useSocketEvent<T extends keyof ServerToClientEvents>(
  event: T,
  handler: ServerToClientEvents[T],
  socket: React.RefObject<CSocket | null>,
) {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    const listener = (...args: unknown[]) => {
      (saved.current as (...a: unknown[]) => void)(...args);
    };
    // The generic index cannot be narrowed to a concrete listener signature, so
    // register through a widened view of `on`/`off`. Types stay checked at the
    // call site via the `ServerToClientEvents` contract above.
    const emitter = s as unknown as {
      on: (e: string, l: (...a: unknown[]) => void) => void;
      off: (e: string, l: (...a: unknown[]) => void) => void;
    };

    emitter.on(event as string, listener);
    return () => emitter.off(event as string, listener);
  }, [event, socket]);
}

/** Promise wrapper around socket acks, so callers can `await` a send. */
export function emitWithAck<T extends keyof ClientToServerEvents>(
  socket: CSocket,
  event: T,
  payload: Parameters<ClientToServerEvents[T]>[0],
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  return new Promise((resolve) => {
    // Never queue on a dead socket: socket.io buffers the packet and flushes it
    // on the next successful connect, so the timer below would expire long
    // before the server ever saw it. Fail fast and let the caller fall back.
    if (!socket.connected) {
      resolve({ ok: false, error: 'Not connected.' });
      return;
    }

    const timer = setTimeout(
      () => resolve({ ok: false, error: 'Timed out. Check your connection.' }),
      8000,
    );
    const ack: Ack = (response) => {
      clearTimeout(timer);
      resolve(response);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket.emit as any)(event, payload, ack);
  });
}

/** Fire-and-forget REST helper with typed error extraction. */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data?.error?.message ?? `Request failed (${res.status}). Please try again.`;
    throw new Error(message);
  }

  return data as T;
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(fn);
  saved.current = fn;

  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => saved.current(...args), delay);
    },
    [delay],
  );
}

export type { ChatMessagePayload };