/*
 * Service worker for CS Hub.
 *
 * Deliberately minimal, because this is an authenticated app.
 *
 * The rule this file exists to enforce: NOTHING user-specific is ever written
 * to the Cache API. Every request here is either a navigations request (which
 * falls through to the network and is never cached) or one of a small, fixed
 * list of public static files. A cache entry for /dashboard would show the
 * previous user's data to the next person to open the app on a shared device,
 * and it would survive sign-out, because `caches` is not cleared by the server.
 *
 * It is also not an offline-first app. Forum posts, chat history and grades all
 * change constantly, and a stale copy of any of them is worse than an error.
 */

const VERSION = 'v1';
const SHELL_CACHE = `cs-hub-shell-${VERSION}`;

// Public, unchanging assets only. Anything authenticated or user-generated is
// deliberately absent.
const PRECACHE = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is atomic: if one entry 404s the whole install fails. Tolerate
      // individual failures so a stale precache list cannot block activation.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch anything but same-origin GET. A POST to the message API must
  // reach the network untouched, and a cross-origin request is none of our
  // business.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Socket.io, the REST API and uploads are always live. Caching a chat GET
  // would both serve stale history and pin a response containing private
  // messages in a store the user cannot inspect or clear from the UI.
  if (url.pathname.startsWith('/api/')) return;

  // A navigation is a page of the app, which is always user-specific. Go to the
  // network; if it fails, offer the offline page rather than a stale document.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () =>
          caches.match('/offline', { cacheName: SHELL_CACHE }).then(
            (cached) =>
              cached ??
              new Response('You are offline.', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
              }),
          ),
      ),
    );
    return;
  }

  // The only thing cached: build assets and icons, which are content-hashed or
  // versioned and identical for every user.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            // Only durable, same-origin, successful responses are stored.
            if (response.ok && response.type === 'basic') {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
