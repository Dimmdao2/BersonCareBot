import { NextResponse } from "next/server";
import { getLoginAlternativesPublicConfig } from "@/modules/auth/loginAlternativesConfig";

/** GET — публичный конфиг входа (Max-бот, VK URL и т.д.) для экрана входа, без секретов. */
export async function GET() {
  const cfg = await getLoginAlternativesPublicConfig();
  return NextResponse.json({ ok: true as const, ...cfg });
}
