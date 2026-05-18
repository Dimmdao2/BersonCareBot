/**
 * Минимальный service worker для installability PWA: без кэша и без перехвата fetch
 * (сеть ведёт себя как без SW). Регистрация — с лендинга `/` с `scope: "/app"`, не в Mini App (см. PwaInstallSection).
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
