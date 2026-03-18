import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "token is required" }, { status: 400 });
  }

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

  return NextResponse.json({
    ok: true,
    role: result.session.user.role,
    redirectTo: result.redirectTo,
  });
}
