/**
 * Ограничение частоты POST /api/auth/oauth/start по клиенту.
 * Ключ — только X-Real-Ip (nginx должен выставить $remote_addr); X-Forwarded-For не используется.
 */
import { env } from "@/config/env";
import { logger } from "@/infra/logging/logger";

const SCOPE = "auth.oauth_start";

/** Общий bucket только в non-production, если прокси не передал X-Real-Ip. */
export const OAUTH_START_FALLBACK_CLIENT_KEY = "oauth_start:missing_x_real_ip";

export type OAuthStartRateLimitClientKeyResult =
  | { ok: true; key: string }
  | { ok: false; reason: "missing_x_real_ip" };

/**
 * Клиентский ключ для rate limit: только доверенный `X-Real-Ip` от nginx.
 * В production при отсутствии заголовка — `ok: false` (без fallback-ключа).
 */
export function resolveOAuthStartRateLimitClientKey(request: Request): OAuthStartRateLimitClientKeyResult {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && real.length > 0) {
    return { ok: true, key: real };
  }

  if (env.NODE_ENV === "production") {
    logger.error({
      msg: "oauth_start_x_real_ip_required",
      scope: SCOPE,
      reason: "missing_x_real_ip",
    });
    return { ok: false, reason: "missing_x_real_ip" };
  }

  logger.debug({ msg: "oauth_start_missing_x_real_ip", scope: SCOPE });
  return { ok: true, key: OAUTH_START_FALLBACK_CLIENT_KEY };
}

export { isOAuthStartRateLimitedByKey } from "@/modules/auth/authRateLimits";
