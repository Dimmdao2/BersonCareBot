import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { handleVkOAuthCallbackGet } from '@/modules/auth/vkOAuthCallbackHandler';

/**
 * GET /api/auth/oauth/callback/vk — VK ID (OAuth 2.1 + PKCE; совпадает с `vk_id_redirect_uri`).
 */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/callback/vk:GET', request);
  return handleVkOAuthCallbackGet(request, buildAppDeps());
}
