import { NextResponse } from "next/server";
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
export async function GET() {
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
  return res;
}
