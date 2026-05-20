import { NextResponse } from "next/server";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";

/** GET — публичная ссылка «Связаться с поддержкой» (без секретов). */
export async function GET() {
  const url = await getSupportContactUrl();
  return NextResponse.json({ ok: true as const, url });
}
