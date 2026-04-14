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
