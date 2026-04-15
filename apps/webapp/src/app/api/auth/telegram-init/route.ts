import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isMiniappAuthVerboseServerLogEnabled } from "@/modules/auth/miniappAuthVerboseServerLog";
import { logger } from "@/infra/logging/logger";

const bodySchema = z.object({
  initData: z.string().trim().min(1),
});

const ROUTE = "auth/telegram-init";

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
  const verboseServerLog = await isMiniappAuthVerboseServerLogEnabled(deps);
  if (verboseServerLog) {
    const u = new URL(request.url);
    logger.info(
      {
        route: ROUTE,
        outcome: "verbose_raw_log",
        messenger: "telegram",
        requestUri: `${u.pathname}${u.search}`,
        userAgent: request.headers.get("user-agent"),
        correlationId: request.headers.get("x-bc-auth-correlation-id"),
        initDataRawFull: initData,
      },
      "MINIAPP_AUTH_VERBOSE: полный initData (Telegram), см. journalctl webapp",
    );
  }

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
