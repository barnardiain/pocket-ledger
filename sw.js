/* Service worker: cache the app shell for offline launch.
   API calls to Google are always network (never cached). */
var CACHE = 'budget-app-v3';
var SHELL = [
  './', './index.html', './app.js', './styles.css',
  './manifest.webmanifest', './icons/icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // never cache the backend; let it hit the network
  if (url.hostname.indexOf('script.google') >= 0 || url.hostname.indexOf('googleusercontent') >= 0) return;
  if (e.request.method !== 'GET') return;
  // cache-first for the shell, fall back to network
  e.respondWith(
    caches.match(e.request).then(function (hit) { return hit || fetch(e.request); })
  );
});
