import { NextRequest, NextResponse } from "next/server";
import {
  PLATFORM_COOKIE_NAME,
  PLATFORM_COOKIE_MAX_AGE,
} from "@/shared/lib/platform";

export type PlatformContextHandlerOptions = {
  /** Для тестов; по умолчанию `process.env.NODE_ENV === "production"`. */
  isProduction?: boolean;
};

/**
 * Если в URL есть `?ctx=bot`, ставит cookie платформы и редиректит без параметра.
 * Вынесено для unit-тестов; вызывается из `src/middleware.ts`.
 */
export function handlePlatformContextRequest(
  request: NextRequest,
  opts?: PlatformContextHandlerOptions,
): NextResponse {
  const ctx = request.nextUrl.searchParams.get("ctx");
  if (ctx !== "bot") {
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
  return response;
}
