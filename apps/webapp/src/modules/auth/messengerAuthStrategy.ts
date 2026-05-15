/**
 * Единая политика клиентского bootstrap для мессенджерных mini app (Telegram / MAX) на entry **`/app`**, **`/app/tg`**, **`/app/max`**.
 * Отделена от UI, чтобы тестировать без React.
 */

/** Время ожидания появления `window.WebApp` после инжекта MAX Bridge (скрипт async). */
export const MAX_BRIDGE_LOAD_GRACE_MS = 4000;

/** Жёсткий cap опроса initData в AuthBootstrap (messenger path). Раньше 15000 — см. legacy alias ниже. */
export const MESSENGER_HARD_POLL_CAP_MS = 7000;

/** После grace MAX bridge для чистого Telegram Mini App — быстрее показать интерактивный вход, если initData так и не пришёл. */
export const MESSENGER_INIT_POLL_SHORT_MS = 550;

/**
 * @deprecated Имя сохранено для совместимости импортов; значение = {@link MESSENGER_HARD_POLL_CAP_MS}.
 * Исторически было 15000.
 */
export const MESSENGER_INIT_POLL_CAP_MS = MESSENGER_HARD_POLL_CAP_MS;

/** Ранний показ интерактивного login в обычном браузере (не блокировать AuthFlowV2). */
export const BROWSER_SOFT_TIMEOUT_MS = 1000;

/** Ранний показ интерактивного login при suspected messenger (initData ещё нет). */
export const MESSENGER_SOFT_TIMEOUT_MS = 2000;

/** Алиас политики: совпадает с {@link MESSENGER_HARD_POLL_CAP_MS} для опроса. */
export const MESSENGER_HARD_TIMEOUT_MS = MESSENGER_HARD_POLL_CAP_MS;

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

/** Серверный ключ MAX не задан или вход через MAX недоступен — не показываем телефонный OTP и не переключаем на Telegram. */
export const MAX_SERVICE_UNAVAILABLE_MESSAGE =
  "Вход через MAX временно недоступен из‑за настройки сервера. Откройте приложение через бота в MAX или попробуйте позже.";

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

/** Есть признаки мессенджерного контекста без подтверждённого initData (URL/cookie/bridge). */
export function isSuspectedMessengerContext(input: {
  messengerFromUrlOrCookie: boolean;
  maxBridgeReady: boolean;
  telegramWebAppPresent: boolean;
}): boolean {
  if (!input.messengerFromUrlOrCookie) return false;
  return input.telegramWebAppPresent || input.maxBridgeReady;
}

/** Подтверждённый mini app: непустой TG или MAX initData. */
export function isConfirmedMessengerByInitData(input: {
  telegramInitData: string;
  maxInitData: string;
}): boolean {
  return Boolean(input.telegramInitData.trim()) || Boolean(input.maxInitData.trim());
}

/** Feature flag: ранний интерактивный login + prefetch (`AuthBootstrap` / `AuthFlowV2`). */
export function isAuthBootstrapEarlyUiV2Enabled(): boolean {
  const v = process.env.NEXT_PUBLIC_AUTH_BOOTSTRAP_EARLY_UI_V2?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Показать интерактивный login (не блокировать до initData / poll cap).
 * В контексте messenger mini app (`ctx`/cookie) **не** показываем телефонный флоу при `state === "error"`
 * (таймаут initData / отказ init) — только `Повторить` / подсказки; исключение: {@link isAuthBootstrapEarlyUiV2Enabled}
 * + messenger soft-timeout при ещё `unknown` initData.
 * На канонических `/app/tg` и `/app/max` интерактивный веб-вход отключён полностью — только initData, резервный `?t=`, ошибка.
 */
export function shouldExposeInteractiveLogin(input: {
  earlyUiEnabled: boolean;
  isMessengerMiniAppEntry: boolean;
  messengerSoftOk: boolean;
  browserSoftOk: boolean;
  initDataStatus: "unknown" | "yes" | "no";
  state: "idle" | "loading" | "error";
  /** Явный miniapp-entry роут: не показывать OAuth/телефон как «обычный сайт». */
  routeBoundMiniappEntry?: boolean;
}): boolean {
  if (input.initDataStatus === "no") {
    if (input.routeBoundMiniappEntry && input.isMessengerMiniAppEntry) return false;
    return true;
  }

  if (input.routeBoundMiniappEntry && input.isMessengerMiniAppEntry) {
    return false;
  }

  if (input.isMessengerMiniAppEntry) {
    if (input.state === "error") return false;
    if (
      input.earlyUiEnabled &&
      input.state === "idle" &&
      input.initDataStatus === "unknown" &&
      input.messengerSoftOk
    ) {
      return true;
    }
    return false;
  }

  if (input.state === "error") return true;
  if (!input.earlyUiEnabled || input.initDataStatus !== "unknown") return false;
  return input.browserSoftOk;
}
