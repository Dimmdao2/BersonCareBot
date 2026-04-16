import { NextResponse } from "next/server";
import { logAuthRouteTiming } from "@/modules/auth/authRouteObservability";
import { getLoginAlternativesPublicConfig } from "@/modules/auth/loginAlternativesConfig";

const ROUTE = "auth/login/alternatives-config";

/** GET — публичный конфиг входа (Max-бот, VK URL и т.д.) для экрана входа, без секретов. */
export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const cfg = await getLoginAlternativesPublicConfig();
    const res = NextResponse.json({ ok: true as const, ...cfg });
    logAuthRouteTiming({
      route: ROUTE,
      request,
      startedAt,
      status: 200,
      outcome: "ok",
    });
    return res;
  } catch (e) {
    const res = NextResponse.json({ ok: false as const, error: "config_unavailable" }, { status: 500 });
    logAuthRouteTiming({
      route: ROUTE,
      request,
      startedAt,
      status: 500,
      outcome: "error",
      errorType: e instanceof Error ? e.name : "unknown",
    });
    return res;
  }
}
