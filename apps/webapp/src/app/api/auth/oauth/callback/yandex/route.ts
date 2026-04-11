import { handleYandexOAuthCallbackGet } from "@/modules/auth/yandexOAuthCallbackHandler";

/**
 * GET /api/auth/oauth/callback/yandex — Yandex OAuth (канонический callback; совпадает с `yandex_oauth_redirect_uri`).
 */
export async function GET(request: Request) {
  return handleYandexOAuthCallbackGet(request);
}
