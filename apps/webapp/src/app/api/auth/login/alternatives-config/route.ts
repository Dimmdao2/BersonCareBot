import { NextResponse } from "next/server";
import { getLoginAlternativesPublicConfig } from "@/modules/auth/loginAlternativesConfig";

/** GET — публичный конфиг для «Другие способы входа» (Telegram / Max / VK), без секретов. */
export async function GET() {
  const cfg = await getLoginAlternativesPublicConfig();
  return NextResponse.json({ ok: true as const, ...cfg });
}
