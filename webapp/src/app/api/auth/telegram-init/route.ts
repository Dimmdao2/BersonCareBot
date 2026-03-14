import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/**
 * Authenticates using Telegram Web App initData (when user opens Mini App from menu/button without ?t= token).
 * Validates initData signature, checks ALLOWED_TELEGRAM_IDS / ADMIN_TELEGRAM_ID, creates session.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { initData?: string } | null;
  const initData = typeof body?.initData === "string" ? body.initData.trim() : "";
  if (!initData) {
    return NextResponse.json({ ok: false, error: "initData is required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.auth.exchangeTelegramInitData(initData);
  if (!result) {
    return NextResponse.json({ ok: false, error: "access_denied" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    role: result.session.user.role,
    redirectTo: result.redirectTo,
  });
}
