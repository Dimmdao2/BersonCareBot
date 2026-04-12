/**
 * Открытие deep link t.me после async fetch без popup-blocker: синхронно
 * `window.open('about:blank')`, затем присвоение `location.href`.
 * На мобильных — предпочтение `tg://resolve?domain=…&start=…` для открытия приложения Telegram.
 */

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
