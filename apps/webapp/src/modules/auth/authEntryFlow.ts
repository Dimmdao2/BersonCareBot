/**
 * Явное разделение сценариев входа: Telegram (initData / JWT), MAX (initData; query JWT не основной),
 * обычный браузер (логин по телефону / OAuth / JWT в URL).
 */

export type AuthEntryFlow = "telegram" | "max" | "browser";

/** Query-параметр `ctx=max` — явный контекст MAX из ссылки бота (если клиент не обрезает query). */
export const MAX_ENTRY_CTX_QUERY = "max";

export function readMessengerCtxParam(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get("ctx")?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * При `ctx=max` не используем `?t=` / `token` как основной вход (политика MAX Mini App).
 */
export function shouldSuppressQueryJwtForMaxCtx(searchParams: URLSearchParams): boolean {
  return readMessengerCtxParam(searchParams) === MAX_ENTRY_CTX_QUERY;
}

/**
 * Классификация по данным страницы (URL + при необходимости вызывается после mount с `window`).
 */
export function classifyAuthEntryFlowFromSearchParams(searchParams: URLSearchParams): AuthEntryFlow {
  if (shouldSuppressQueryJwtForMaxCtx(searchParams)) return "max";
  const bot = searchParams.get("ctx")?.trim();
  if (bot === "bot") return "telegram";
  return "browser";
}

export type ClientMessengerProbe = {
  hasTelegramWebApp: boolean;
  telegramInitDataLength: number;
  hasMaxWebApp: boolean;
  maxInitDataLength: number;
  maxReady: boolean;
};

export function probeClientMessengerEnv(): ClientMessengerProbe {
  if (typeof window === "undefined") {
    return {
      hasTelegramWebApp: false,
      telegramInitDataLength: 0,
      hasMaxWebApp: false,
      maxInitDataLength: 0,
      maxReady: false,
    };
  }
  const tg = window.Telegram?.WebApp;
  const tgInit = typeof tg?.initData === "string" ? tg.initData.trim() : "";
  const max = (window as Window & { WebApp?: { initData?: string; ready?: () => void } }).WebApp;
  const maxInit = typeof max?.initData === "string" ? max.initData.trim() : "";
  return {
    hasTelegramWebApp: Boolean(tg),
    telegramInitDataLength: tgInit.length,
    hasMaxWebApp: Boolean(max),
    maxInitDataLength: maxInit.length,
    maxReady: typeof max?.ready === "function",
  };
}

/**
 * Среда похожа на MAX Mini App: есть bridge `WebApp.ready`, при этом нет данных Telegram initData.
 * Используется, чтобы не отправлять query JWT, пока ждём `WebApp.initData`.
 */
