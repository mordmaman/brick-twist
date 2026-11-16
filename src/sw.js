// Brick Twist service worker: offline play after the first visit, and updates that always reach players.
// build.py copies this file to ../sw.js and stamps __VERSION__ (a hash of the page and every cached file), so
// each build that changes anything gets a new cache. Nobody bumps a number by hand.
//
//  - The page (any navigation, index.html): network first, so an online player always gets the newest build.
//    It is fetched past the browser's HTTP cache (revalidated), and stored for offline play. If the network
//    fails, or is slower than NET_TIMEOUT, the stored copy is used; a late answer still refreshes the store.
//  - The other files (manifest, icons): from the cache filled at install, else the network.
//  - A new worker takes over at once, and deletes every older brick-twist cache when it activates.
'use strict';

var VERSION = '__VERSION__';
var PREFIX = 'brick-twist-';
var CACHE = PREFIX + VERSION;
var FILES = [
  __FILES__
];
var NET_TIMEOUT = 3500; // ms to wait for the network before falling back to the stored page

function scopePath() { return new URL(self.registration.scope).pathname; }
function pageKey() { return new URL('./', self.registration.scope).href; }

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(FILES.map(function (f) {
      return fetch(new Request(f, { cache: 'reload' })).then(function (r) {
        if (!r.ok) throw new Error('install: ' + f + ' ' + r.status);
        return cache.put(f === './' ? pageKey() : new URL(f, self.registration.scope).href, r);
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(scopePath()) !== 0) return;
  var rel = url.pathname.slice(scopePath().length);
  if (rel === 'sw.js') return; // the browser checks for a new worker itself
  if (req.mode === 'navigate' || rel === '' || rel === 'index.html') { e.respondWith(page(e, url)); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req);
  }));
});

function page(e, url) {
  return caches.open(CACHE).then(function (cache) {
    var net = fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (r && r.ok && r.type === 'basic') return cache.put(pageKey(), r.clone()).then(function () { return r; });
      return r;
    });
    e.waitUntil(net.catch(function () {}));
    var timer = new Promise(function (res) { setTimeout(res, NET_TIMEOUT, null); });
    return Promise.race([net.catch(function () { return null; }), timer]).then(function (r) {
      if (r && r.ok) return r;
      return cache.match(pageKey()).then(function (hit) { return hit || r || net; });
    });
  });
}
