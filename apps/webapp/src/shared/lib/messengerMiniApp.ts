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

function readPlatformCookieBot(): boolean {
  if (typeof document === "undefined") return false;
  const m = document.cookie.match(new RegExp(`(?:^|; )${PLATFORM_COOKIE_NAME}=([^;]*)`));
  const raw = m?.[1] ? decodeURIComponent(m[1]) : "";
  return raw === "bot";
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
  const webApp = (window as Window & { WebApp?: { ready?: () => void } }).WebApp;
  return Boolean(webApp && typeof webApp.ready === "function");
}

/** Закрыть WebView мини-приложения (Telegram / MAX), если API доступен. */
/**
 * Подсказка для M2M request-contact: в какой канал слать клавиатуру, если в сессии есть оба binding.
 * Telegram Mini App → telegram; MAX WebView (без TG initData/cookie) → max.
 * Сервер при **двух** binding без этого заголовка возвращает `400 contact_channel_required` — клиент должен передавать заголовок, когда хост миниаппа однозначен.
 */
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
