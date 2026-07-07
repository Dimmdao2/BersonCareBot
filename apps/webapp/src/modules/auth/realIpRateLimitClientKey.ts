/**
 * Общий резолвер клиентского ключа для per-IP rate limit публичных auth-роутов.
 * Ключ — только доверенный `X-Real-Ip` (nginx выставляет $remote_addr);
 * X-Forwarded-For не используется (подделывается клиентом).
 *
 * Единая точка (chokepoint): oauth/start и email-otp/start используют ЭТОТ резолвер,
 * различаясь только scope-меткой для логов и fallback-ключом.
 */
import { env } from "@/config/env";
import { logger } from "@/infra/logging/logger";

export type RealIpRateLimitClientKeyResult =
  | { ok: true; key: string }
  | { ok: false; reason: "missing_x_real_ip" };

/**
 * В production при отсутствии X-Real-Ip — `ok: false` (роут должен вернуть 503:
 * это ошибка конфигурации прокси, лимитировать по общему ключу нельзя).
 * В non-production — общий fallback-ключ, чтобы dev работал без nginx.
 */
export function resolveRealIpRateLimitClientKey(
  request: Request,
  opts: { scope: string; logPrefix: string; fallbackKey: string },
): RealIpRateLimitClientKeyResult {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && real.length > 0) {
    return { ok: true, key: real };
  }

  if (env.NODE_ENV === "production") {
    logger.error({
      msg: `${opts.logPrefix}_x_real_ip_required`,
      scope: opts.scope,
      reason: "missing_x_real_ip",
    });
    return { ok: false, reason: "missing_x_real_ip" };
  }

  logger.debug({ msg: `${opts.logPrefix}_missing_x_real_ip`, scope: opts.scope });
  return { ok: true, key: opts.fallbackKey };
}
