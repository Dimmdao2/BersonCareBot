/**
 * Открытие deep link t.me после async fetch без popup-blocker: синхронно
 * `window.open('about:blank')`, затем присвоение `location.href`.
 * На мобильных — предпочтение `tg://resolve?domain=…&start=…` для открытия приложения Telegram.
 *
 * В **Telegram Mini App** нельзя открывать `about:blank` — WebView спрашивает «Open about:blank?»;
 * используем `Telegram.WebApp.openTelegramLink` / `openLink`. В **MAX Mini App** — `WebApp.openMaxLink`
 * для диплинков max.ru (см. dev.max.ru — MAX Bridge).
 */

import { inferMessengerChannelForRequestContact } from "@/shared/lib/messengerMiniApp";

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
    const finalUrl =
      channel === "telegram" ? pickTelegramOpenUrl(url, userAgent) : url;
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
 */
export function finishChannelLinkNavigation(params: {
  blankWin: Window | null;
  url: string;
  channel: ChannelLinkOpenChannel;
  userAgent: string;
}): void {
  const { blankWin, url, channel, userAgent } = params;
  const host = inferMessengerChannelForRequestContact();

  if (host === "telegram") {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebAppOpen } }).Telegram?.WebApp;
    if (tg) {
      if (channel === "telegram" && typeof tg.openTelegramLink === "function") {
        tg.openTelegramLink(url);
        safeCloseBlank(blankWin);
        return;
      }
      if (typeof tg.openLink === "function") {
        const toOpen = channel === "telegram" ? pickTelegramOpenUrl(url, userAgent) : url;
        tg.openLink(toOpen, { try_instant_view: false });
        safeCloseBlank(blankWin);
        return;
      }
    }
  }

  if (host === "max") {
    const w = (window as Window & { WebApp?: MaxWebAppOpen }).WebApp;
    if (w) {
      if (channel === "max" && isMaxChannelDeepLinkUrl(url) && typeof w.openMaxLink === "function") {
        w.openMaxLink(url);
        safeCloseBlank(blankWin);
        return;
      }
      if (typeof w.openLink === "function") {
        const toOpen = channel === "telegram" ? pickTelegramOpenUrl(url, userAgent) : url;
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

  const toOpen = channel === "telegram" ? pickTelegramOpenUrl(url, userAgent) : url;
  window.open(toOpen, "_blank", "noopener,noreferrer");
}
