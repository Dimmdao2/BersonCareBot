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

/**
 * Минимальная ширина **viewport** (окна), при которой в админских настройках показывается
 * вертикальное меню разделов; ниже — выпадающий список.
 * Ниже `DESKTOP_BREAKPOINT`, чтобы типичные планшеты в портрете и узкие планшеты попадали в режим с меню слева; переключение делается через `matchMedia`, а не только через классы Tailwind.
 */
export const ADMIN_SETTINGS_NAV_MIN_WIDTH_PX = 640;

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
