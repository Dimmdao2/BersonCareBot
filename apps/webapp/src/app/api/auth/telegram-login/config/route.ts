import { NextResponse } from "next/server";
import { logAuthRouteTiming } from "@/modules/auth/authRouteObservability";
import { getTelegramLoginBotUsername } from "@/modules/system-settings/telegramLoginBotUsername";

const ROUTE = "auth/telegram-login/config";

/** Публичный конфиг для Telegram Login Widget: имя бота (без секретов). */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const raw = (await getTelegramLoginBotUsername()).trim();
  const botUsername = raw.length > 0 ? raw : null;
  const res = NextResponse.json({ ok: true as const, botUsername });
  logAuthRouteTiming({
    route: ROUTE,
    request,
    startedAt,
    status: 200,
    outcome: "ok",
  });
  return res;
}
