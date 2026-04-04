import { NextResponse } from "next/server";
import { z } from "zod";
import { isProduction } from "@/config/env";
import {
  getYandexOauthClientId,
  getYandexOauthClientSecret,
  getYandexOauthRedirectUri,
} from "@/modules/system-settings/integrationRuntime";

const OAUTH_STATE_COOKIE = "oauth_state_yandex";
const OAUTH_STATE_TTL_SECONDS = 600; // 10 минут

const bodySchema = z.object({
  provider: z.enum(["yandex", "google", "apple"]),
});

/**
 * Старт OAuth (служебный backend): Яндекс — при наличии ключей в `system_settings` (admin).
 * Генерирует state, httpOnly cookie, возвращает authUrl. Публичная кнопка в login UI не используется.
 * Google/Apple — отложено.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите провайдера" },
      { status: 400 }
    );
  }

  if (parsed.data.provider !== "yandex") {
    return NextResponse.json(
      { ok: false, error: "oauth_disabled", message: "Провайдер пока недоступен" },
      { status: 501 }
    );
  }

  const clientId = (await getYandexOauthClientId()).trim();
  const redirectUri = (await getYandexOauthRedirectUri()).trim();
  const secret = (await getYandexOauthClientSecret()).trim();
  if (!clientId || !redirectUri || !secret) {
    return NextResponse.json(
      { ok: false, error: "oauth_disabled", message: "OAuth не настроен" },
      { status: 501 }
    );
  }

  const state = crypto.randomUUID();

  const authUrl = new URL("https://oauth.yandex.ru/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "login:info login:email");
  authUrl.searchParams.set("state", state);

  const res = NextResponse.json({ ok: true, authUrl: authUrl.toString() });
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return res;
}
