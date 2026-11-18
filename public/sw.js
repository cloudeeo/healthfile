// Offline shell only: the page, its script, styles and icon. Documents and
// API answers are never cached here; they stay on the server.
const SHELL = 'healthfile-shell-v1';
const FILES = ['./', 'index.html', 'app.js', 'i18n.js', 'style.css', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request)));
});
