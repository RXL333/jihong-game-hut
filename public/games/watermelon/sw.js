
const PREFIX = 'watermelon-garden:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + '0ccdebf7d11a';
const FILES = ["THIRD_PARTY_NOTICES.txt","assets/fruit-atlas-v2.png","assets/fruit-cartoon.png","assets/fruit-clay.png","assets/fruit-fluffy.png","assets/fruit-realistic.png","assets/index-C8RRXnTm.js","assets/index-CPN3JCLR.css","icon.svg","index.html","manifest.webmanifest"].map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true })));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, { ignoreVary: true });
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  }));
});
