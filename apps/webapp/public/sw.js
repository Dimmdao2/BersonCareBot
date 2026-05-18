/**
 * PWA service worker: без перехвата `fetch`. Push и открытие по клику — только same-origin пути `/app/*`.
 * Регистрация с `scope: "/app"` (см. PwaInstallSection / PHASE_02).
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function safeOpenPathFromNotificationUrl(raw) {
  const fallback = "/app";
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    const u = new URL(raw, self.location.origin);
    if (u.origin !== self.location.origin) return fallback;
    if (!u.pathname.startsWith("/app")) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "Напоминание";
  const body = typeof data.body === "string" ? data.body : "";
  const url = typeof data.url === "string" ? data.url : "/app";
  const tag = typeof data.tag === "string" ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
    }),
  );
});

/** Клиент пере-подписывает push (VAPID только в приложении). */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "WEB_PUSH_SUBSCRIPTION_CHANGE" });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const openPath = safeOpenPathFromNotificationUrl(raw);
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        try {
          const cu = new URL(client.url);
          if (
            cu.origin === self.location.origin &&
            cu.pathname.startsWith("/app") &&
            "focus" in client
          ) {
            await client.focus();
            if ("navigate" in client && typeof client.navigate === "function") {
              await client.navigate(openPath);
            }
            return;
          }
        } catch {
          /* next client */
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(openPath);
      }
    })(),
  );
});
