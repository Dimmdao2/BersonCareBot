import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { logAuthRouteTiming } from "@/modules/auth/authRouteObservability";
import { getPublicRuntimeBool } from "@/modules/system-settings/configAdapter";

/**
 * GET /api/auth/oauth/providers — какие провайдеры настроены (без секретов).
 */
const ROUTE = "auth/oauth/providers";

export async function GET(request: Request) {
  stampBootstrapPrincipal("api/auth/oauth/providers:GET", request);
  const startedAt = Date.now();
  const [yandex, google, apple] = await Promise.all([
    getPublicRuntimeBool("oauth_yandex_enabled"),
    getPublicRuntimeBool("oauth_google_enabled"),
    getPublicRuntimeBool("oauth_apple_enabled"),
  ]);

  const res = NextResponse.json({ ok: true, yandex, google, apple });
  res.headers.set("Cache-Control", "private, no-store");
  logAuthRouteTiming({
    route: ROUTE,
    request,
    startedAt,
    status: 200,
    outcome: "ok",
  });
  return res;
}
