/**
 * Единая политика клиентского bootstrap для мессенджерных mini app (Telegram / MAX) на `/app`.
 * Отделена от UI, чтобы тестировать без React.
 */

/** Время ожидания появления `window.WebApp` после инжекта MAX Bridge (скрипт async). */
export const MAX_BRIDGE_LOAD_GRACE_MS = 4000;

/** Совпадает с циклом опроса initData в AuthBootstrap. */
export const MESSENGER_INIT_POLL_CAP_MS = 15000;

export const MAX_INIT_DATA_TIMEOUT_USER_MESSAGE =
  "Не удалось войти через MAX: приложение не передало данные для входа. Закройте мини-приложение и откройте его снова из чата с ботом.";

/**
 * Пока нет query JWT, Telegram initData пустой, а MAX bridge ещё не загрузился —
 * не показываем форму телефона (иначе пользователь MAX видит «обычный сайт» до появления initData).
 */
export function shouldDeferPhoneLoginWhileMaxBridgeMayLoad(input: {
  token: string | null;
  elapsedMs: number;
  telegramInitDataEmpty: boolean;
  maxInitDataEmpty: boolean;
  maxBridgeReady: boolean;
}): boolean {
  if (input.token != null) return false;
  if (!input.telegramInitDataEmpty) return false;
  if (!input.maxInitDataEmpty) return false;
  if (input.maxBridgeReady) return false;
  return input.elapsedMs < MAX_BRIDGE_LOAD_GRACE_MS;
}

/**
 * Поверхность MAX Mini App: bridge уже есть, Telegram initData пуст (в MAX нет TG данных).
 */
export function isLikelyMaxMiniAppSurface(telegramInitDataEmpty: boolean, maxBridgeReady: boolean): boolean {
  return maxBridgeReady && telegramInitDataEmpty;
}
