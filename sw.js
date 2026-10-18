// Stamp Loupe service worker. It makes the hosted app load fast and work
// offline. It is used only by the site build (npm run build:site), which
// writes the list of files to precache into the BUILD line below. The raw
// dev setup (npm run serve) and the Claude artifact never register it.
//
// What it does:
// - App page: network first, so updates arrive, with the cached copy as the
//   fallback when offline or when the network is very slow.
// - Hashed bundles in build/: cache first. Their names change when they change.
// - Google Fonts: served from cache, refreshed in the background.
// - Shared photos (the manifest share target): stored in the "share-inbox"
//   cache, then the app opens with ?shared=1 and takes them.
// - Everything else, including every request to api.anthropic.com or a proxy,
//   is left alone.

const BUILD = { "version": "dev", "precache": [] }; /* @sl-build */

const SHELL = 'sl-shell-' + BUILD.version;
const FONTS = 'sl-fonts';
const INBOX = 'share-inbox';
const SCOPE = new URL(self.registration.scope);
const at = path => new URL(path, SCOPE).href;
const INDEX = at('./index.html');
const SHARE_PATH = new URL('./share', SCOPE).pathname;
const BUILD_PATH = new URL('./build/', SCOPE).pathname;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Bypass the HTTP cache so a new version never stores stale files.
    await cache.addAll(BUILD.precache.map(p => new Request(at(p), { cache: 'reload' })));
  })());
  // No skipWaiting here: an update waits until the page asks for it.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('sl-shell-') && n !== SHELL).map(n => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) { /* not supported */ }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === 'POST') {
    if (url.origin === SCOPE.origin && url.pathname === SHARE_PATH) event.respondWith(receiveShare(req));
    return; // every other POST, including Claude API calls, goes straight to the network
  }
  if (req.method !== 'GET') return;

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, FONTS));
    return;
  }
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(appPage(event));
    return;
  }
  if (url.pathname.startsWith(BUILD_PATH)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  event.respondWith(cacheThenNetwork(req));
});

/** The app page: network first, cached copy if offline or slower than NAV_TIMEOUT_MS. */
async function appPage(event) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(INDEX);
  const network = (async () => {
    const pre = await event.preloadResponse;
    return pre || fetch(event.request);
  })();
  if (!cached) return network;
  try {
    const res = await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT_MS))
    ]);
    if (res && (res.ok || res.type === 'opaqueredirect')) return res;
    return cached;
  } catch (_) {
    network.catch(() => {}); // a late network answer is dropped
    return cached;
  }
}

/** Hashed files never change, so the cached copy is always right. */
async function cacheFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

/** Icons, manifest and other unhashed files in the app folder. */
async function cacheThenNetwork(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  return fetch(req);
}

async function staleWhileRevalidate(event, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone()).catch(() => {});
    return res;
  });
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  return refresh;
}

/** Share target: keep the shared photos for the app, then open it. */
async function receiveShare(req) {
  try {
    const form = await req.formData();
    const files = form.getAll('photos').filter(f => f && typeof f === 'object' && typeof f.size === 'number' && /^image\//.test(f.type || ''));
    if (files.length) {
      const inbox = await caches.open(INBOX);
      const stamp = Date.now();
      await Promise.all(files.slice(0, 10).map((f, i) => inbox.put(
        new Request(at('./share-inbox/' + stamp + '-' + String(i).padStart(2, '0'))),
        new Response(f, { headers: {
          'content-type': f.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(f.name || 'shared-photo-' + (i + 1) + '.jpg')
        } })
      )));
    }
  } catch (_) {
    // A broken share still opens the app.
  }
  return Response.redirect(at('./?shared=1'), 303);
}
