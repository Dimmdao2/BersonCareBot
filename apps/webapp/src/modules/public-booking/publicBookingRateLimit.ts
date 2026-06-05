/**
 * Rate limit для публичного POST /api/booking/public/create.
 * Ключ — X-Real-Ip (как OAuth); в dev — fallback.
 */
import { env } from "@/config/env";
import { isPublicBookingCreateRateLimited as isPublicBookingCreateRateLimitedCore } from "@/modules/auth/authRateLimits";
import { logger } from "@/infra/logging/logger";

const SCOPE = "booking.public_create";

export const PUBLIC_BOOKING_RATE_LIMIT_SEC = 3600;
export const PUBLIC_BOOKING_FALLBACK_CLIENT_KEY = "public_booking:missing_x_real_ip";

export type PublicBookingRateLimitKeyResult =
  | { ok: true; key: string }
  | { ok: false; reason: "missing_x_real_ip" };

export function resolvePublicBookingRateLimitClientKey(request: Request): PublicBookingRateLimitKeyResult {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && real.length > 0) {
    return { ok: true, key: real };
  }
  if (env.NODE_ENV === "production") {
    logger.error({ msg: "public_booking_x_real_ip_required", scope: SCOPE });
    return { ok: false, reason: "missing_x_real_ip" };
  }
  logger.debug({ msg: "public_booking_missing_x_real_ip", scope: SCOPE });
  return { ok: true, key: PUBLIC_BOOKING_FALLBACK_CLIENT_KEY };
}

export async function isPublicBookingCreateRateLimited(key: string): Promise<boolean> {
  return isPublicBookingCreateRateLimitedCore(key);
}
