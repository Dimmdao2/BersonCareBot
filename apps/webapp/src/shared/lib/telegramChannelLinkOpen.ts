/**
 * Открытие deep link привязки канала (POST /api/auth/channel-link/start) после async fetch.
 *
 * - **Telegram Mini App:** `Telegram.WebApp.openTelegramLink` / `openLink`.
 * - **MAX Mini App:** `WebApp.openMaxLink` / `openLink` (dev.max.ru — MAX Bridge).
 * - **Installed PWA:** Telegram — `location.assign` на `tg://resolve?…`; MAX — `window.open` / `<a target="_blank">`
 *   (HTTPS `max.ru`, без схемы `max://`), чтобы по возможности открыть во внешнем браузере, а не в WebView PWA.
 *   Заглушка `https://max.ru/` без `?start=` в PWA не открывается.
 * - **Обычный браузер:** `window.open`; на мобильном UA для Telegram — `tg://` при разборе `t.me`.
 */

import { inferMessengerChannelForRequestContact } from "@/shared/lib/messengerMiniApp";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";

/**
 * Раньше использовалось, чтобы решить, открывать ли преждевременную вкладку `about:blank`.
 * UI channel-link больше не открывает `about:blank` до fetch (диалог в WebView); функция оставлена на случай внешних вызовов.
 */
export function shouldDeferChannelLinkBlankWindow(): boolean {
  return inferMessengerChannelForRequestContact() !== undefined;
}

/** Детект мобильного UA для выбора tg:// vs https. */
export function isLikelyMobileUserAgent(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

/**
 * Строит `tg://resolve?domain=&start=` из `https://t.me/<bot>?start=...`.
 * Возвращает null, если URL не распознан как t.me deep link с параметром start.
 */
export function buildTgAppDeepLink(tmeUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(tmeUrl);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== "t.me" && host !== "telegram.me") {
    return null;
  }
  const path = u.pathname.replace(/^\//, "").split("/")[0]?.trim() ?? "";
  if (!path || path.startsWith("+")) {
    return null;
  }
  const domain = path.startsWith("@") ? path.slice(1) : path;
  if (!domain) {
    return null;
  }
  const start = u.searchParams.get("start");
  if (!start || !start.trim()) {
    return null;
  }
  return `tg://resolve?domain=${encodeURIComponent(domain)}&start=${encodeURIComponent(start.trim())}`;
}

/** Для мобильных — tg:// при успешном разборе, иначе исходный URL. */
export function pickTelegramOpenUrl(tmeUrl: string, userAgent: string): string {
  if (!isLikelyMobileUserAgent(userAgent)) {
    return tmeUrl;
  }
  return buildTgAppDeepLink(tmeUrl) ?? tmeUrl;
}

/** Итоговый URL для channel-link: в installed PWA для Telegram всегда предпочитаем tg://. */
export function pickChannelLinkOpenUrl(
  url: string,
  channel: ChannelLinkOpenChannel,
  userAgent: string,
  options?: { standalonePwa?: boolean },
): string {
  if (channel === "telegram") {
    if (options?.standalonePwa) {
      return buildTgAppDeepLink(url) ?? url;
    }
    return pickTelegramOpenUrl(url, userAgent);
  }
  return url;
}

/** MAX Bridge вне Mini App (если скрипт уже на странице). */
function tryOpenMaxDeepLinkViaBridge(url: string): boolean {
  if (!isMaxChannelDeepLinkUrl(url)) return false;
  const w = (window as Window & { WebApp?: MaxWebAppOpen }).WebApp;
  if (typeof w?.openMaxLink === "function") {
    w.openMaxLink(url);
    return true;
  }
  return false;
}

/** Новая вкладка / внешний браузер (не навигация текущего WebView). */
function openInNewBrowserTab(url: string): boolean {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) return true;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener noreferrer";
  anchor.target = "_blank";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return false;
}

/**
 * Standalone PWA: Telegram — `location.assign(tg://)` (приложение Telegram); MAX — внешняя вкладка.
 * Для `https://t.me` в PWA `window.open('_blank')` часто остаётся внутри WebView — поэтому TG не через open.
 */
function openChannelLinkInBrowserOrPwa(
  toOpen: string,
  standalonePwa: boolean,
  channel: ChannelLinkOpenChannel,
): void {
  if (standalonePwa && channel === "max") {
    if (tryOpenMaxDeepLinkViaBridge(toOpen)) return;
    if (!isMaxChannelDeepLinkUrl(toOpen)) return;
    const opened = openInNewBrowserTab(toOpen);
    if (opened) return;
    // In installed PWA, popup opening after async fetch may be blocked.
    // Fallback to same-tab navigation so click still has observable effect.
    try {
      window.location.assign(toOpen);
      return;
    } catch {
      /* fall through */
    }
    return;
  }

  if (!standalonePwa) {
    openInNewBrowserTab(toOpen);
    return;
  }

  try {
    window.location.assign(toOpen);
    return;
  } catch {
    /* fall through */
  }
  openInNewBrowserTab(toOpen);
}

/** Ответ API channel-link для MAX с диплинком `https://max.ru/<nick>?start=…`. */
export function isMaxChannelDeepLinkUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    return host === "max.ru" && u.searchParams.has("start");
  } catch {
    return false;
  }
}

export type ChannelLinkOpenChannel = "telegram" | "max";

/**
 * Навигация заранее открытой вкладки `about:blank` на итоговый URL.
 * Для Telegram на мобильных подставляется tg:// при возможности.
 */
export function assignChannelLinkToBlankWindow(
  blankWin: Window,
  url: string,
  channel: ChannelLinkOpenChannel,
  userAgent: string
): void {
  try {
    const finalUrl = pickChannelLinkOpenUrl(url, channel, userAgent, {
      standalonePwa: isStandalonePwa(),
    });
    blankWin.location.href = finalUrl;
  } catch {
    try {
      blankWin.close();
    } catch {
      /* ignore */
    }
  }
}

type TelegramWebAppOpen = {
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

type MaxWebAppOpen = {
  openMaxLink?: (url: string) => void;
  openLink?: (url: string) => void;
};

function safeCloseBlank(blankWin: Window | null): void {
  try {
    blankWin?.close();
  } catch {
    /* ignore */
  }
}

/**
 * Завершает переход по ссылке привязки после POST: мост TG/MAX Mini App или вкладка about:blank.
 * Для повторного открытия по ссылке из UI (без заранее открытой вкладки) передайте `blankWin: null`.
 *
 * Важно: не опираемся только на `inferMessengerChannelForRequestContact()` для ветки Telegram —
 * `initData`/cookie иногда ещё не готовы, тогда раньше выполнялся `window.open` и в WebView Telegram
 * навигация блокировалась; при этом `Telegram.WebApp` уже есть — используем `openLink`/`openTelegramLink`.
 */
export function finishChannelLinkNavigation(params: {
  blankWin: Window | null;
  url: string;
  channel: ChannelLinkOpenChannel;
  userAgent: string;
}): void {
  const { blankWin, url, channel, userAgent } = params;

  const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebAppOpen } }).Telegram?.WebApp;
  if (tg) {
    if (channel === "telegram" && typeof tg.openTelegramLink === "function") {
      tg.openTelegramLink(url);
      safeCloseBlank(blankWin);
      return;
    }
    if (typeof tg.openLink === "function") {
      const toOpen = pickChannelLinkOpenUrl(url, channel, userAgent);
      tg.openLink(toOpen, { try_instant_view: false });
      safeCloseBlank(blankWin);
      return;
    }
  }

  const host = inferMessengerChannelForRequestContact();

  if (host === "max") {
    const w = (window as Window & { WebApp?: MaxWebAppOpen }).WebApp;
    if (w) {
      if (channel === "max" && isMaxChannelDeepLinkUrl(url) && typeof w.openMaxLink === "function") {
        w.openMaxLink(url);
        safeCloseBlank(blankWin);
        return;
      }
      if (typeof w.openLink === "function") {
        const toOpen = pickChannelLinkOpenUrl(url, channel, userAgent);
        w.openLink(toOpen);
        safeCloseBlank(blankWin);
        return;
      }
    }
  }

  if (blankWin) {
    assignChannelLinkToBlankWindow(blankWin, url, channel, userAgent);
    return;
  }

  const standalonePwa = isStandalonePwa();
  const toOpen = pickChannelLinkOpenUrl(url, channel, userAgent, { standalonePwa });
  openChannelLinkInBrowserOrPwa(toOpen, standalonePwa, channel);
}
