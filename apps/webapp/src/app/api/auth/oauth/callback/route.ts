import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { handleYandexOAuthCallbackGet } from '@/modules/auth/yandexOAuthCallbackHandler';

/**
 * GET /api/auth/oauth/callback — legacy Yandex callback (тот же обработчик, что `/callback/yandex`).
 * Предпочтительно указывать в кабинете Яндекса **`/api/auth/oauth/callback/yandex`**.
 */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/callback:GET', request);
  return handleYandexOAuthCallbackGet(request, buildAppDeps());
}
