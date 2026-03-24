import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";

const bodySchema = z.object({
  provider: z.enum(["yandex", "google", "apple"]),
});

/**
 * Старт OAuth. Яндекс — при наличии env; иначе предсказуемый ответ «отключено».
 * Google/Apple — отдельные PR (этап 5.5).
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

  const clientId = env.YANDEX_OAUTH_CLIENT_ID?.trim();
  const redirectUri = env.YANDEX_OAUTH_REDIRECT_URI?.trim();
  const secret = env.YANDEX_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !redirectUri || !secret) {
    return NextResponse.json(
      { ok: false, error: "oauth_disabled", message: "OAuth не настроен" },
      { status: 501 }
    );
  }

  const authUrl = new URL("https://oauth.yandex.ru/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "login:info login:email");

  return NextResponse.json({
    ok: true,
    authUrl: authUrl.toString(),
  });
}
