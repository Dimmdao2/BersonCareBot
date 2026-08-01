import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { handleYandexOAuthCallbackGet } from '@/modules/auth/yandexOAuthCallbackHandler';

/**
 * GET /api/auth/oauth/callback/yandex — Yandex OAuth (канонический callback; совпадает с `yandex_oauth_redirect_uri`).
 */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/callback/yandex:GET', request);
  return handleYandexOAuthCallbackGet(request, buildAppDeps());
}
