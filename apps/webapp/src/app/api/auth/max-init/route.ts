import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { PLATFORM_COOKIE_MAX_AGE, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

const bodySchema = z.object({
  initData: z.string().trim().min(1),
});

/**
 * Аутентификация по `window.WebApp.initData` (MAX Mini App), без `?t=` в URL.
 * Подпись: https://dev.max.ru/docs/webapps/validation ; ключ: `max_bot_api_key` в admin settings.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "initData is required" }, { status: 400 });
  }
  const { initData } = parsed.data;

  const deps = buildAppDeps();
  const result = await deps.auth.exchangeMaxInitData(initData);
  if (!result) {
    return NextResponse.json({ ok: false, error: "access_denied" }, { status: 403 });
  }

  const response = NextResponse.json({
    ok: true,
    role: result.session.user.role,
    redirectTo: result.redirectTo,
  });
  const isProd = process.env.NODE_ENV === "production";
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
