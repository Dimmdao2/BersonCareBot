import { startTransition } from "react";

import { getMaxWebAppInitDataForAuth } from "@/shared/lib/messengerMiniApp";

/**
 * Восстановление cookie-сессии webapp внутри мессенджерного Mini App, когда `/api/me` даёт 401:
 * - Telegram: `POST /api/auth/telegram-init` с `initData`;
 * - MAX: `POST /api/auth/max-init` с `window.WebApp.initData`;
 * - ссылка с `?t=` / `?token=` (частый вход из Max/TG бота): `POST /api/auth/exchange`.
 */
export async function ensureMessengerMiniAppWebappSession(router: { refresh: () => void }): Promise<void> {
  if (typeof window === "undefined") return;

  const me = await fetch("/api/me", { credentials: "include" });
  if (me.ok) return;
  if (me.status !== 401) return;

  const initData = window.Telegram?.WebApp?.initData?.trim() ?? "";
  if (initData.length > 0) {
    const res = await fetch("/api/auth/telegram-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ initData }),
    });
    if (res.ok) {
      startTransition(() => router.refresh());
    }
    return;
  }

  const maxInit = getMaxWebAppInitDataForAuth();
  if (maxInit.length > 0) {
    const res = await fetch("/api/auth/max-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ initData: maxInit }),
    });
    if (res.ok) {
      startTransition(() => router.refresh());
    }
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("ctx") === "max") {
    return;
  }

  const token = (params.get("t") ?? params.get("token"))?.trim() ?? "";
  if (!token.length) return;

  const res = await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (res.ok) {
    startTransition(() => router.refresh());
  }
}
