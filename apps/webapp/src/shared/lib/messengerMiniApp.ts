/**
 * Определяет, открыт ли webapp внутри мессенджерного Mini App.
 *
 * - **Telegram:** `window.Telegram.WebApp`
 * - **MAX:** глобальный `window.WebApp` (bridge, см. dev.max.ru — WebApps / MAX Bridge)
 */

export function isMessengerMiniAppHost(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Telegram?.WebApp) return true;
  const webApp = (window as Window & { WebApp?: { ready?: () => void } }).WebApp;
  return Boolean(webApp && typeof webApp.ready === "function");
}
