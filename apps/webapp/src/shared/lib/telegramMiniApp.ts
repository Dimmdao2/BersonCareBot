/**
 * Telegram Mini App (клиент): есть непустой initData — открыто внутри клиента Telegram.
 * Не путать с `isMessengerMiniAppHost`: тот же признак для Telegram; для MAX используется другой bridge.
 */
export function isTelegramMiniAppWithInitData(): boolean {
  if (typeof window === "undefined") return false;
  const tg = window.Telegram?.WebApp;
  return Boolean(tg && typeof tg.initData === "string" && tg.initData.length > 0);
}
