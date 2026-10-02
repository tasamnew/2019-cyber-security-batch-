/**
 * Behavioural check for public/sw.js.
 *
 * The caching rules in the worker are the only thing standing between a shared
 * device and the previous user's private messages, so they are asserted here
 * rather than trusted to a read-through.
 */
import { readFile } from 'node:fs/promises';

const src = await readFile('public/sw.js', 'utf8');

// Minimal stand-in for the SW globals.
const listeners = new Map();
let respondWithArg = null;

const caches = {
  store: new Map(),
  opened: null,
  async open(name) {
    caches.opened = name;
    return {
      async add(url) {
        caches.store.set(url, { url });
      },
      async put(req, res) {
        caches.store.set(req.url, res);
      },
      async match(req) {
        const key = typeof req === 'string' ? req : req.url;
        return caches.store.get(key);
      },
    };
  },
  async keys() {
    return [caches.opened].filter(Boolean);
  },
  async match(req) {
    const key = typeof req === 'string' ? req : req.url;
    return caches.store.get(key);
  },
  async delete() {
    return true;
  },
};

const self = {
  location: { origin: 'https://hub.example' },
  addEventListener: (type, fn) => listeners.set(type, fn),
  skipWaiting: async () => {},
  clients: { claim: async () => {} },
};

new Function('self', 'caches', 'fetch', src)(self, caches, async () => {
  throw new Error('network should not be reached in these cases');
});

console.log('registered events:', [...listeners.keys()].join(', '));
if (!listeners.has('install') || !listeners.has('activate') || !listeners.has('fetch')) {
  throw new Error('missing a lifecycle handler');
}

// Registered by the worker at load time; asserted present above.
listeners.get('fetch');

async function run(request) {
  respondWithArg = 'UNSET';
  let captured = null;
  // Re-invoke with a fetch that records whether it was reached.
  new Function('self', 'caches', 'fetch', src)(self, caches, async (r) => {
    captured = r;
    return { ok: true, type: 'basic', clone: () => ({}) };
  });
  listeners.get('fetch')({ request, respondWith: (p) => { respondWithArg = p; } });
  const result = await respondWithArg;
  return { handled: respondWithArg !== 'UNSET', reachedNetwork: captured, result };
}

const cases = [
  {
    name: 'navigation to /dashboard',
    req: { method: 'GET', url: 'https://hub.example/dashboard', mode: 'navigate' },
    expectNetwork: true,
  },
  {
    name: 'chat API GET (private messages)',
    req: { method: 'GET', url: 'https://hub.example/api/channels/c1/messages', mode: 'cors' },
    expectNetwork: false,
    expectHandled: false,
  },
  {
    name: 'socket.io polling',
    req: { method: 'GET', url: 'https://hub.example/api/socket.io/?EIO=4', mode: 'cors' },
    expectHandled: false,
  },
  {
    name: 'message POST',
    req: { method: 'POST', url: 'https://hub.example/api/channels/c1/messages', mode: 'cors' },
    expectHandled: false,
  },
  {
    name: 'cross-origin GET',
    req: { method: 'GET', url: 'https://cdn.other.com/x.js', mode: 'no-cors' },
    expectHandled: false,
  },
  {
    name: 'build asset /_next/static',
    req: { method: 'GET', url: 'https://hub.example/_next/static/chunk.js', mode: 'no-cors' },
    expectNetwork: true,
  },
];

let failures = 0;
for (const c of cases) {
  const { handled, reachedNetwork } = await run(c.req);
  const wantNetwork = c.expectNetwork === true;
  const wantHandled = c.expectHandled !== false;
  const okHandled = handled === wantHandled;
  const okNetwork = wantNetwork ? reachedNetwork !== null : true;
  if (!okHandled || !okNetwork) failures++;
  console.log(
    `${okHandled && okNetwork ? 'PASS' : 'FAIL'}  ${c.name.padEnd(30)} respondWith=${String(handled).padEnd(5)} network=${reachedNetwork ? 'reached' : 'bypassed'}`,
  );
}

// After the assertions, prove the cache cannot contain a private document.
const cached = [...caches.store.keys()];
console.log('\ncache keys after run:', JSON.stringify(cached));
const leaked = cached.filter((k) => k.includes('/api/') || k.includes('/dashboard') || k.includes('/chat'));
if (leaked.length) {
  failures++;
  console.log('FAIL  private entries cached:', leaked);
} else {
  console.log('PASS  no private/authorised content in the Cache API');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
