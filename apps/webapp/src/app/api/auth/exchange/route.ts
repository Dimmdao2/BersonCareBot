import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { PLATFORM_COOKIE_MAX_AGE, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

const bodySchema = z.object({
  token: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "token is required" }, { status: 400 });
  }
  const { token } = parsed.data;

  const deps = buildAppDeps();
  const result = await deps.auth.exchangeIntegratorToken(token);
  if (!result) {
    if (process.env.NODE_ENV !== "test") {
      console.info("[auth/exchange] access_denied");
    }
    return NextResponse.json({ ok: false, error: "access_denied" }, { status: 403 });
  }

  const source = result.session.user.bindings?.maxId
    ? "max"
    : result.session.user.bindings?.telegramId
      ? "telegram"
      : "web";
  if (process.env.NODE_ENV !== "test") {
    console.info("[auth/exchange] success source=%s role=%s", source, result.session.user.role);
  }

  const response = NextResponse.json({
    ok: true,
    role: result.session.user.role,
    redirectTo: result.redirectTo,
  });
  if (source === "telegram" || source === "max") {
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
  }
  return response;
}
