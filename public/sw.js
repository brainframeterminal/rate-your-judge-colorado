// Service worker: the app shell works offline; API calls are never cached (ratings must be live).
// HTML/JS/CSS are network-first so a new deploy shows up on the next visit; fonts/icons are cache-first.
const V = 'rygc-v23';
const SHELL = ['/', '/style.css', '/app.js', '/i18n.js', '/scene.js', '/common.js', '/loader.js', '/img/judge-turn.webp', '/log.js', '/log.html', '/about.html', '/how.html', '/method.html', '/security.html', '/join.html', '/terms.html', '/privacy.html', '/corrections.html', '/pages.js', '/feedback.js', '/track.js', '/captcha.js', '/modal.js', '/device.js', '/img/logo-128.webp', '/img/logo-320.webp', '/co-map.json', '/fonts/inter-latin.woff2', '/fonts/pjs-latin.woff2', '/offline.html'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  const asset = /\.(woff2|png|svg)$/.test(u.pathname);
  if (asset) { e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); return res; }))); return; }
  e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); return res; })
    .catch(() => caches.match(r).then(hit => hit || (r.mode === 'navigate' ? caches.match('/offline.html') : Response.error()))));
});
