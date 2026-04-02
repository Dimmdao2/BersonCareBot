/**
 * Открывает внешнюю ссылку из mini app (Telegram WebApp) или в обычном браузере.
 */
export function openExternalLinkInMessenger(href: string): void {
  if (typeof window === "undefined") return;
  const tg = (
    window as Window & {
      Telegram?: { WebApp?: { openLink?: (url: string, options?: { try_instant_view?: boolean }) => void } };
    }
  ).Telegram?.WebApp;
  if (tg?.openLink && typeof tg.openLink === "function") {
    tg.openLink(href);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}
