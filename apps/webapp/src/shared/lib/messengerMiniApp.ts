/**
 * Определяет, открыт ли webapp внутри мессенджерного Mini App.
 *
 * - **Telegram:** `window.Telegram.WebApp`
 * - **MAX:** глобальный `window.WebApp` (bridge, см. dev.max.ru — WebApps / MAX Bridge)
 */

import { PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

/** Telegram WebApp bridge: types in repo only expose `initData`; runtime also has `close()`. */
type TelegramMiniWebApp = {
  initData?: string;
  close?: () => void;
};

function getTelegramWebApp(): TelegramMiniWebApp | undefined {
  return window.Telegram?.WebApp as TelegramMiniWebApp | undefined;
}

export function readPlatformCookieBot(): boolean {
  if (typeof document === "undefined") return false;
  const m = document.cookie.match(new RegExp(`(?:^|; )${PLATFORM_COOKIE_NAME}=([^;]*)`));
  const raw = m?.[1] ? decodeURIComponent(m[1]) : "";
  return raw === "bot";
}

/**
 * `telegram-web-app.js` подключается и в обычном браузере: тогда `WebApp.platform` обычно `web` / `weba` / `webk` / `unknown`,
 * либо ещё не выставлен (пустая строка). Во встроенном WebView клиента Telegram — `ios` / `android` / `tdesktop` и т.д.
 * Нужно, чтобы не держать пользователя в miniapp-ветке из‑за устаревшего `bersoncare_platform=bot` cookie.
 */
export function isTelegramWebAppExternalBrowserSurface(): boolean {
  if (typeof window === "undefined") return false;
  const tg = window.Telegram?.WebApp as { platform?: string } | undefined;
  if (!tg) return false;
  const p = typeof tg.platform === "string" ? tg.platform.toLowerCase().trim() : "";
  if (p === "web" || p === "weba" || p === "webk" || p === "unknown") return true;
  if (p === "") return true;
  return false;
}

export function isMessengerMiniAppHost(): boolean {
  if (typeof window === "undefined") return false;
  const tgWebApp = getTelegramWebApp();
  // Скрипт telegram-web-app.js подключается и в обычном браузере — объект WebApp есть,
  // но вне клиента Telegram initData пустой; иначе кнопка «Выйти» скрывалась везде.
  if (tgWebApp && typeof tgWebApp.initData === "string" && tgWebApp.initData.length > 0) {
    return true;
  }
  // В WebView initData иногда появляется позже; cookie `ctx=bot` уже выставлен middleware.
  if (tgWebApp && readPlatformCookieBot()) {
    return true;
  }
  const webApp = (window as Window & { WebApp?: { initData?: string; ready?: () => void } }).WebApp;
  if (!webApp || typeof webApp.ready !== "function") return false;
  const maxInitData = typeof webApp.initData === "string" ? webApp.initData.trim() : "";
  // В обычном браузере bridge-скрипт MAX тоже создает `window.WebApp`.
  // Mini App контекст считаем только когда есть реальные данные входа или bot-cookie.
  return maxInitData.length > 0 || readPlatformCookieBot();
}

/**
 * Закрыть WebView мини-приложения, если клиент отдаёт метод закрытия.
 *
 * - **Telegram:** [`Telegram.WebApp.close()`](https://core.telegram.org/bots/webapps#initializing-mini-apps) (в типах репозитория опционален).
 * - **MAX:** в публичной доке dev.max.ru перечислены `requestContact`, `openLink`, `BackButton`, и т.д.; отдельного раздела про закрытие WebView может не быть — при наличии у `window.WebApp.close` вызываем его (часто совместимо с Telegram WebApp bridge).
 */
/**
 * Подсказка для M2M request-contact: в какой канал слать клавиатуру, если в сессии есть оба binding.
 * Telegram Mini App → telegram; MAX WebView (без TG initData/cookie) → max.
 * Сервер при **двух** binding без этого заголовка возвращает `400 contact_channel_required` — клиент должен передавать заголовок, когда хост миниаппа однозначен.
 */
/**
 * Сырой `initData` для MAX Mini App (`POST /api/auth/max-init`).
 * Не используем строку, если уже есть Telegram initData (избегаем двойного входа).
 */
export function getMaxWebAppInitDataForAuth(): string {
  if (typeof window === "undefined") return "";
  const tgRaw = getTelegramWebApp()?.initData?.trim() ?? "";
  if (tgRaw.length > 0) return "";
  const w = (window as Window & { WebApp?: { initData?: string; ready?: () => void } }).WebApp;
  if (!w || typeof w.ready !== "function") return "";
  return typeof w.initData === "string" ? w.initData.trim() : "";
}

export function inferMessengerChannelForRequestContact(): "telegram" | "max" | undefined {
  if (typeof window === "undefined") return undefined;
  const tgWebApp = getTelegramWebApp();
  if (
    tgWebApp &&
    ((typeof tgWebApp.initData === "string" && tgWebApp.initData.length > 0) || readPlatformCookieBot())
  ) {
    return "telegram";
  }
  const maxApp = (window as Window & { WebApp?: { ready?: () => void } }).WebApp;
  if (maxApp && typeof maxApp.ready === "function") {
    return "max";
  }
  return undefined;
}

export function closeMessengerMiniApp(): void {
  if (typeof window === "undefined") return;
  const tg = getTelegramWebApp();
  if (tg && typeof tg.close === "function") {
    tg.close();
    return;
  }
  const maxApp = (window as Window & { WebApp?: { close?: () => void } }).WebApp;
  if (maxApp && typeof maxApp.close === "function") {
    maxApp.close();
  }
}
