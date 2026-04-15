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

/** Таймаут initData в miniapp (Telegram / единый контекст `ctx=bot`) без авто-перехода в телефонный флоу. */
export const MESSENGER_MINIAPP_INIT_TIMEOUT_USER_MESSAGE =
  "Не удалось получить данные для входа из мини-приложения. Нажмите «Повторить» или откройте мини-приложение снова из чата с ботом.";

/** Устаревший `bersoncare_platform=bot` в обычном браузере: cookie сбрасывается, далее показывается обычный веб-вход. */
export const STALE_BOT_PLATFORM_COOKIE_STANDALONE_MESSAGE =
  "Обнаружена устаревшая метка входа из мини-приложения в обычном браузере — она сброшена. Ниже доступен вход через сайт (OAuth или номер телефона).";

/** Отказ miniapp init (например whitelist / не нажат Start): явная подсказка пользователю. */
export const MINIAPP_ACTIVATE_BOT_AND_AUTH_MESSAGE =
  "Активируйте бота: откройте чат с ботом и нажмите Start, затем снова откройте приложение из бота. Если уже нажимали Start — нажмите «Повторить».";

/**
 * Пока нет query JWT, Telegram initData пустой, а MAX bridge ещё не загрузился —
 * не показываем форму телефона (иначе пользователь MAX видит «обычный сайт» до появления initData).
 * Только в контексте возможного мессенджерного mini app (`messengerMiniAppContext`), иначе обычный браузер не ждёт bridge.
 */
export function shouldDeferPhoneLoginWhileMaxBridgeMayLoad(input: {
  token: string | null;
  elapsedMs: number;
  telegramInitDataEmpty: boolean;
  maxInitDataEmpty: boolean;
  maxBridgeReady: boolean;
  messengerMiniAppContext: boolean;
}): boolean {
  if (!input.messengerMiniAppContext) return false;
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
