import { NextResponse } from "next/server";
import { logAuthRouteTiming } from "@/modules/auth/authRouteObservability";
import {
  getYandexOauthClientId,
  getYandexOauthClientSecret,
  getYandexOauthRedirectUri,
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleOauthLoginRedirectUri,
  getAppleOauthClientId,
  getAppleOauthRedirectUri,
  getAppleOauthTeamId,
  getAppleOauthKeyId,
  getAppleOauthPrivateKey,
} from "@/modules/system-settings/integrationRuntime";

/**
 * GET /api/auth/oauth/providers — какие провайдеры настроены (без секретов).
 */
const ROUTE = "auth/oauth/providers";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const [yId, ySec, yRedir, gId, gSec, gLogin, aId, aRedir, aTeam, aKid, aPem] = await Promise.all([
    getYandexOauthClientId(),
    getYandexOauthClientSecret(),
    getYandexOauthRedirectUri(),
    getGoogleClientId(),
    getGoogleClientSecret(),
    getGoogleOauthLoginRedirectUri(),
    getAppleOauthClientId(),
    getAppleOauthRedirectUri(),
    getAppleOauthTeamId(),
    getAppleOauthKeyId(),
    getAppleOauthPrivateKey(),
  ]);

  const yandex =
    yId.trim().length > 0 && ySec.trim().length > 0 && yRedir.trim().length > 0;
  const google =
    gId.trim().length > 0 && gSec.trim().length > 0 && gLogin.trim().length > 0;
  const apple =
    aId.trim().length > 0 &&
    aRedir.trim().length > 0 &&
    aTeam.trim().length > 0 &&
    aKid.trim().length > 0 &&
    aPem.trim().length > 0;

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
