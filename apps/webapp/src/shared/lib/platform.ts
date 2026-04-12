/**
 * Платформенный контекст: типы и константы для cookie и breakpoints.
 * См. platform.md.
 */

export type PlatformEntry = "bot" | "standalone";

export type PlatformMode = "bot" | "mobile" | "desktop";

export const PLATFORM_COOKIE_NAME = "bersoncare_platform";

export const PLATFORM_COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

/** Совпадает с Tailwind `md:` */
export const DESKTOP_BREAKPOINT = 768;

export type PlatformCookieSerializeOptions = {
  secure: boolean;
};

/**
 * Строка Set-Cookie-подобных атрибутов для `document.cookie` (fallback в Mini App).
 * В production: SameSite=None; Secure. Локально по http — Lax без Secure.
 */
export function serializePlatformCookie(
  entry: PlatformEntry,
  opts: PlatformCookieSerializeOptions,
): string {
  const sameSite = opts.secure ? "None" : "Lax";
  const securePart = opts.secure ? "; Secure" : "";
  return `${PLATFORM_COOKIE_NAME}=${entry}; Path=/; Max-Age=${PLATFORM_COOKIE_MAX_AGE}; SameSite=${sameSite}${securePart}`;
}

export function serializePlatformBotCookie(opts: PlatformCookieSerializeOptions): string {
  return serializePlatformCookie("bot", opts);
}
