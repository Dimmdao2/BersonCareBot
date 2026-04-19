import { NextRequest, NextResponse } from "next/server";
import {
  MESSENGER_SURFACE_COOKIE_NAME,
  PLATFORM_COOKIE_NAME,
  PLATFORM_COOKIE_MAX_AGE,
  type MessengerSurfaceHint,
} from "@/shared/lib/platform";

export type PlatformContextHandlerOptions = {
  /** Для тестов; по умолчанию `process.env.NODE_ENV === "production"`. */
  isProduction?: boolean;
};

export type MiddlewareEntryHint =
  | "token_exchange"
  | "telegram_miniapp"
  | "max_miniapp"
  | "browser_interactive";

/**
 * Если в URL есть `?ctx=bot` (канон) или legacy `?ctx=max`, ставит cookie платформы `bot` и редиректит без параметра.
 * Вынесено для unit-тестов; вызывается из `src/middleware.ts`.
 */
export function handlePlatformContextRequest(
  request: NextRequest,
  opts?: PlatformContextHandlerOptions,
): NextResponse {
  const ctx = request.nextUrl.searchParams.get("ctx")?.trim();
  if (ctx !== "bot" && ctx !== "max") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.searchParams.delete("ctx");

  const isProd = opts?.isProduction ?? process.env.NODE_ENV === "production";
  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: PLATFORM_COOKIE_NAME,
    value: "bot",
    path: "/",
    maxAge: PLATFORM_COOKIE_MAX_AGE,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    httpOnly: false,
  });
  const surface: MessengerSurfaceHint = ctx === "max" ? "max" : "telegram";
  response.cookies.set({
    name: MESSENGER_SURFACE_COOKIE_NAME,
    value: surface,
    path: "/",
    maxAge: PLATFORM_COOKIE_MAX_AGE,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    httpOnly: false,
  });
  return response;
}

/** Предклассификация входа на edge (без проверки server-session). */
export function classifyEntryHintFromRequest(request: NextRequest): MiddlewareEntryHint {
  const token = (request.nextUrl.searchParams.get("t") ?? request.nextUrl.searchParams.get("token") ?? "").trim();
  const platformCookie = request.cookies.get(PLATFORM_COOKIE_NAME)?.value === "bot";
  const surfaceCookie = request.cookies.get(MESSENGER_SURFACE_COOKIE_NAME)?.value;
  if (platformCookie) {
    return surfaceCookie === "max" ? "max_miniapp" : "telegram_miniapp";
  }
  if (token.length > 0) return "token_exchange";
  return "browser_interactive";
}
