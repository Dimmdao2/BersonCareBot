/**
 * Минимальный service worker для installability PWA: только сеть, без кэша HTML/API.
 * Регистрация — с лендинга `/` с `scope: "/app"`, не в Mini App (см. PwaInstallSection).
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
