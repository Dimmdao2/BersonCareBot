/**
 * Ограничение частоты POST /api/auth/oauth/start по клиенту.
 * Ключ — только X-Real-Ip; общий резолвер в realIpRateLimitClientKey.ts (chokepoint).
 */
import {
  resolveRealIpRateLimitClientKey,
  type RealIpRateLimitClientKeyResult,
} from "@/modules/auth/realIpRateLimitClientKey";

const SCOPE = "auth.oauth_start";

/** Общий bucket только в non-production, если прокси не передал X-Real-Ip. */
export const OAUTH_START_FALLBACK_CLIENT_KEY = "oauth_start:missing_x_real_ip";

export type OAuthStartRateLimitClientKeyResult = RealIpRateLimitClientKeyResult;

/**
 * Клиентский ключ для rate limit: только доверенный `X-Real-Ip` от nginx.
 * В production при отсутствии заголовка — `ok: false` (без fallback-ключа).
 */
export function resolveOAuthStartRateLimitClientKey(request: Request): OAuthStartRateLimitClientKeyResult {
  return resolveRealIpRateLimitClientKey(request, {
    scope: SCOPE,
    logPrefix: "oauth_start",
    fallbackKey: OAUTH_START_FALLBACK_CLIENT_KEY,
  });
}

export { isOAuthStartRateLimitedByKey } from "@/modules/auth/authRateLimits";
