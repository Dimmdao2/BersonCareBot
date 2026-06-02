import { startTransition } from "react";

import {
  clearMessengerBindingCandidate,
  readMessengerBindingCandidate,
} from "@/shared/lib/messengerBindingCandidate";
import { getMaxWebAppInitDataForAuth, readTelegramInitDataForAuth } from "@/shared/lib/messengerMiniApp";

/**
 * Восстановление cookie-сессии webapp внутри мессенджерного Mini App, когда `/api/me` даёт 401:
 * - Telegram: `POST /api/auth/telegram-init` с `initData`;
 * - MAX: `POST /api/auth/max-init` с `window.WebApp.initData`;
 * - ссылка с `?t=` / `?token=` (частый вход из Max/TG бота): `POST /api/auth/exchange`.
 */

let ensureSessionInFlight: Promise<void> | null = null;
const SESSION_RECOVERY_FETCH_TIMEOUT_MS = 12_000;

async function fetchWithRecoveryTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timeoutId = window.setTimeout(() => ac.abort(), SESSION_RECOVERY_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: ac.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function ensureMessengerMiniAppWebappSessionImpl(router: { refresh: () => void }): Promise<void> {
  if (typeof window === "undefined") return;

  let me: Response;
  try {
    me = await fetchWithRecoveryTimeout("/api/me", { credentials: "include" });
  } catch {
    return;
  }
  if (me.ok) return;
  if (me.status !== 401) return;

  const initData = readTelegramInitDataForAuth();
  if (initData.length > 0) {
    let res: Response;
    try {
      res = await fetchWithRecoveryTimeout("/api/auth/telegram-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      });
    } catch {
      return;
    }
    if (res.ok) {
      startTransition(() => router.refresh());
    }
    return;
  }

  const maxInit = getMaxWebAppInitDataForAuth();
  if (maxInit.length > 0) {
    let res: Response;
    try {
      res = await fetchWithRecoveryTimeout("/api/auth/max-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData: maxInit }),
      });
    } catch {
      return;
    }
    if (res.ok) {
      startTransition(() => router.refresh());
    }
    return;
  }

  const bindingCand = readMessengerBindingCandidate();
  if (bindingCand?.channel === "telegram" && bindingCand.initData.length > 0) {
    let sessionRecovered = false;
    try {
      const res = await fetchWithRecoveryTimeout("/api/auth/telegram-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData: bindingCand.initData }),
      });
      if (res.ok) {
        clearMessengerBindingCandidate();
        startTransition(() => router.refresh());
        sessionRecovered = true;
      } else {
        clearMessengerBindingCandidate();
      }
    } catch {
      /* сеть: кандидат остаётся; ниже — fallback `exchange` по ?t= при наличии токена */
    }
    if (sessionRecovered) return;
  }
  if (bindingCand?.channel === "max" && bindingCand.initData.length > 0) {
    let sessionRecovered = false;
    try {
      const res = await fetchWithRecoveryTimeout("/api/auth/max-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData: bindingCand.initData }),
      });
      if (res.ok) {
        clearMessengerBindingCandidate();
        startTransition(() => router.refresh());
        sessionRecovered = true;
      } else {
        clearMessengerBindingCandidate();
      }
    } catch {
      /* сеть: кандидат остаётся; ниже — exchange */
    }
    if (sessionRecovered) return;
  }

  const params = new URLSearchParams(window.location.search);
  const token = (params.get("t") ?? params.get("token"))?.trim() ?? "";
  if (!token.length) return;

  let res: Response;
  try {
    res = await fetchWithRecoveryTimeout("/api/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
  } catch {
    return;
  }
  if (res.ok) {
    startTransition(() => router.refresh());
  }
}

/** Single-flight: параллельные вызовы из гейта и bind-phone не дублируют auth-init. */
export async function ensureMessengerMiniAppWebappSession(router: { refresh: () => void }): Promise<void> {
  if (ensureSessionInFlight) return ensureSessionInFlight;
  ensureSessionInFlight = (async () => {
    try {
      await ensureMessengerMiniAppWebappSessionImpl(router);
    } finally {
      ensureSessionInFlight = null;
    }
  })();
  return ensureSessionInFlight;
}
