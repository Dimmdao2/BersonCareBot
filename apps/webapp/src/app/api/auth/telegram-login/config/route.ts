import { NextResponse } from "next/server";
import { getTelegramLoginBotUsername } from "@/modules/system-settings/telegramLoginBotUsername";

/** Публичный конфиг для Telegram Login Widget: имя бота (без секретов). */
export async function GET() {
  const raw = (await getTelegramLoginBotUsername()).trim();
  const botUsername = raw.length > 0 ? raw : null;
  return NextResponse.json({ ok: true as const, botUsername });
}
