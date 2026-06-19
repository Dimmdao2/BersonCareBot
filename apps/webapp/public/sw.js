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
    return;
  }
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const body = typeof data.body === "string" ? data.body : "";
  if (!title && !body) return;
  const url = typeof data.url === "string" ? data.url : "/app";
  const tag = typeof data.tag === "string" ? data.tag : undefined;
  const notificationData = { url };
  if (typeof data.trackingId === "string" && data.trackingId) {
    notificationData.trackingId = data.trackingId;
  }
  if (typeof data.topicCode === "string" && data.topicCode) {
    notificationData.topicCode = data.topicCode;
  }
  if (typeof data.pushKind === "string" && data.pushKind) {
    notificationData.pushKind = data.pushKind;
  }
  if (typeof data.warmupSloganKey === "string" && data.warmupSloganKey) {
    notificationData.warmupSloganKey = data.warmupSloganKey;
  }
  if (typeof data.occurrenceId === "string" && data.occurrenceId) {
    notificationData.occurrenceId = data.occurrenceId;
  }
  event.waitUntil(
    self.registration.showNotification(title || "BersonCare", {
      body,
      tag,
      data: notificationData,
      ...(notificationData.occurrenceId ? {
        actions: [
          { action: "snooze", title: "Позже" },
          { action: "skip", title: "Пропустить" },
        ],
      } : {}),
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

function postPushOpenBestEffort(data) {
  if (!data || typeof data.trackingId !== "string" || !data.trackingId) return;
  try {
    fetch("/api/patient/analytics/push-open", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pushTrackingId: data.trackingId,
        entryChannel: "pwa",
      }),
    }).catch(() => {});
  } catch {
    /* analytics must not block navigation */
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action;
  const notifData = event.notification.data || {};

  if (action === "snooze" && notifData.occurrenceId) {
    event.waitUntil(
      fetch(`/api/patient/reminders/occurrences/${encodeURIComponent(notifData.occurrenceId)}/snooze`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {}),
    );
    return;
  }

  if (action === "skip" && notifData.occurrenceId) {
    event.waitUntil(
      fetch(`/api/patient/reminders/occurrences/${encodeURIComponent(notifData.occurrenceId)}/skip`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {}),
    );
    return;
  }

  const raw = notifData.url;
  const openPath = safeOpenPathFromNotificationUrl(raw);
  postPushOpenBestEffort(notifData);
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
