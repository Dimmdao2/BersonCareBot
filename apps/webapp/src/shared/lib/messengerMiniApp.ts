/**
 * Определяет, открыт ли webapp внутри мессенджерного Mini App.
 *
 * - **Telegram:** `window.Telegram.WebApp`
 * - **MAX:** глобальный `window.WebApp` (bridge, см. dev.max.ru — WebApps / MAX Bridge)
 */

export function isMessengerMiniAppHost(): boolean {
  if (typeof window === "undefined") return false;
  const tgWebApp = window.Telegram?.WebApp;
  // Скрипт telegram-web-app.js подключается и в обычном браузере — объект WebApp есть,
  // но вне клиента Telegram initData пустой; иначе кнопка «Выйти» скрывалась везде.
  if (tgWebApp && typeof tgWebApp.initData === "string" && tgWebApp.initData.length > 0) {
    return true;
  }
  const webApp = (window as Window & { WebApp?: { ready?: () => void } }).WebApp;
  return Boolean(webApp && typeof webApp.ready === "function");
}
