import { NextResponse } from "next/server";
import { env } from "@/config/env";

/**
 * Callback OAuth. Без полной настройки Яндекса — редирект на страницу входа с флагом ошибки.
 * При полной реализации (этап 5.5): проверить `state` против cookie/session (CSRF), обменять `code` на токен только на сервере.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const clientId = env.YANDEX_OAUTH_CLIENT_ID?.trim();
  const redirectUri = env.YANDEX_OAUTH_REDIRECT_URI?.trim();
  const secret = env.YANDEX_OAUTH_CLIENT_SECRET?.trim();

  if (!clientId || !redirectUri || !secret) {
    return NextResponse.redirect(
      new URL("/app?oauth=disabled&reason=not_configured", env.APP_BASE_URL)
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/app?oauth=error&reason=no_code", env.APP_BASE_URL));
  }

  return NextResponse.redirect(
    new URL("/app?oauth=pending&note=exchange_not_implemented", env.APP_BASE_URL)
  );
}
