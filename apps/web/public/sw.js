const CACHE = 'enshift-shell-v13-staff-pwa';
const SHELL = ['/', '/manifest.json', '/offline.html', '/icons/aen-shift-icon-192.png', '/icons/aen-shift-icon-512.png', '/icons/apple-touch-icon.png', '/icons/aen-shift-maskable.svg'];
const staticPath = path => SHELL.includes(path) || /^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|woff2?)$/.test(path) || /^\/icons\/[A-Za-z0-9_-]+\.(?:png|svg)$/.test(path);
self.addEventListener('install', event => {
  // Wait for explicit activation; do not discard unsaved application input.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('enshift-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('Authorization')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || /^\/api(?:\/|$)/.test(url.pathname) || url.search) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => await caches.match('/offline.html')));
    return;
  }
  if (!staticPath(url.pathname)) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && response.type === 'basic') event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())));
    return response;
  })));
});
