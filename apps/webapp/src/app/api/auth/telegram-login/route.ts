import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { TelegramLoginWidgetPayload } from "@/modules/auth/telegramLoginVerify";
import { verifyTelegramLoginWidgetSignature } from "@/modules/auth/telegramLoginVerify";
import { getTelegramBotToken } from "@/modules/system-settings/integrationRuntime";

const bodySchema = z.record(z.string(), z.unknown());

/**
 * POST /api/auth/telegram-login — вход через Telegram Login Widget (JSON payload от callback виджета).
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const botToken = (await getTelegramBotToken()).trim();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "telegram_not_configured" }, { status: 503 });
  }

  const rawBody = { ...parsed.data } as Record<string, unknown>;
  const webappEntryToken =
    typeof rawBody.webappEntryToken === "string" && rawBody.webappEntryToken.trim() !== ""
      ? rawBody.webappEntryToken.trim()
      : undefined;
  delete rawBody.webappEntryToken;
  const payload = rawBody as TelegramLoginWidgetPayload;
  const deps = buildAppDeps();
  const result = await deps.auth.exchangeTelegramLoginWidget(payload, webappEntryToken);
  if (!result) {
    const diag = verifyTelegramLoginWidgetSignature(payload, botToken);
    if (!diag.ok && diag.reason === "expired") {
      return NextResponse.json(
        {
          ok: false,
          error: "auth_expired",
          message: "Сессия Telegram устарела. Попробуйте снова.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "access_denied", message: "Вход не разрешён." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true as const,
    redirectTo: result.redirectTo,
    role: result.session.user.role,
  });
}
