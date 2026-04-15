/**
 * Явное разделение сценариев входа: Telegram (initData / JWT), MAX (initData; query JWT не основной),
 * обычный браузер (логин по телефону / OAuth / JWT в URL).
 */

export type AuthEntryFlow = "telegram" | "max" | "browser";

/** Query-параметр `ctx=max` — явный контекст MAX из ссылки бота (если клиент не обрезает query). */
export const MAX_ENTRY_CTX_QUERY = "max";

/** Канонический query `ctx=bot` — вход из кнопки бота (Telegram / MAX). */
export const BOT_ENTRY_CTX_QUERY = "bot";

const MESSENGER_SUPPRESS_QUERY_JWT_CTX = new Set<string>([MAX_ENTRY_CTX_QUERY, BOT_ENTRY_CTX_QUERY]);

export function readMessengerCtxParam(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get("ctx")?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * В контексте miniapp из бота (`ctx=bot` или legacy `ctx=max`) не используем `?t=` / `token` как основной вход.
 */
export function shouldSuppressQueryJwtForMessengerMiniApp(searchParams: URLSearchParams): boolean {
  const ctx = readMessengerCtxParam(searchParams);
  return ctx != null && MESSENGER_SUPPRESS_QUERY_JWT_CTX.has(ctx);
}

/**
 * @deprecated Имя историческое; используйте {@link shouldSuppressQueryJwtForMessengerMiniApp}.
 */
export function shouldSuppressQueryJwtForMaxCtx(searchParams: URLSearchParams): boolean {
  return shouldSuppressQueryJwtForMessengerMiniApp(searchParams);
}

/**
 * Классификация по данным страницы (URL + при необходимости вызывается после mount с `window`).
 */
export function classifyAuthEntryFlowFromSearchParams(searchParams: URLSearchParams): AuthEntryFlow {
  if (readMessengerCtxParam(searchParams) === MAX_ENTRY_CTX_QUERY) return "max";
  const bot = searchParams.get("ctx")?.trim();
  if (bot === BOT_ENTRY_CTX_QUERY) return "telegram";
  return "browser";
}
