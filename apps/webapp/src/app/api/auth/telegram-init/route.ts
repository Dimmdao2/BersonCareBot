import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z.object({
  initData: z.string().trim().min(1),
});

/**
 * Authenticates using Telegram Web App initData (when user opens Mini App from menu/button without ?t= token).
 * Validates initData signature, checks ALLOWED_TELEGRAM_IDS / ADMIN_TELEGRAM_ID, creates session.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "initData is required" }, { status: 400 });
  }
  const { initData } = parsed.data;

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
