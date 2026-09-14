'use strict';

const CACHE_NAME = 'vio-converter-v2.4.0-realtime-tests';
const APP_SHELL = [
  './',
  './manifest.webmanifest',
  './styles.css?v=2.4.0-realtime-tests',
  './app.js?v=2.4.0-realtime-tests',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/mediabunny/mediabunny.min.cjs',
  './vendor/mediabunny/mediabunny-aac-encoder.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
