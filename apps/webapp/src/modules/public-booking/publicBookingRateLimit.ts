/**
 * Anti-automation for the two anonymous public-booking writes (OWASP ASVS 5.0 **2.4.1**).
 *
 * Three independent dimensions, because each one alone is defeated by a different attacker:
 *
 *  1. **per-IP on the intent step** (`booking.public_create`, 20/h — unchanged number). Bounds a
 *     single host. Trivially defeated by rotating source addresses, which is why it is not alone.
 *  2. **per-PHONE on code delivery** — inherited, not rebuilt: the intent step issues its code
 *     through `SmsPort.sendCode`, which already runs `assertPhoneCanStartChallenge` (60 s resend
 *     cooldown + `phone_otp_locks` lockout after `OTP_MAX_VERIFY_ATTEMPTS` wrong codes). This is
 *     the dimension that actually matters here: the resource being protected is code delivery to a
 *     phone number, and that is per-number, not per-IP. NIST SP 800-63B §5.2.2 asks for throttling
 *     on the authenticator, not on the network path.
 *  3. **per-IP on the confirm step** (`booking.public_create_confirm`, 30 / 10 min). Its own scope
 *     and its own threshold so that guessing codes cannot be paid for out of the intent budget —
 *     shaped after the existing `patient_invite.email_confirm` pair in `authRateLimits.ts`.
 *
 * The client key also stops sharing one constant across all callers outside production. The old
 * fallback returned a single literal for every request without `X-Real-IP`, so in dev/test one
 * bucket was shared by everybody: one caller could exhaust the limit for all the others, and any
 * per-caller behaviour of the limit was untestable. It now falls back through `X-Forwarded-For`
 * before reaching the shared literal, and production still fails closed on a missing header.
 */
import { env } from "@/config/env";
import {
  isPublicBookingCreateRateLimited as isPublicBookingCreateRateLimitedCore,
  isPublicBookingConfirmRateLimited as isPublicBookingConfirmRateLimitedCore,
} from "@/modules/auth/authRateLimits";
import { logger } from "@/infra/logging/logger";

const SCOPE = "booking.public_create";

export const PUBLIC_BOOKING_RATE_LIMIT_SEC = 3600;
export const PUBLIC_BOOKING_CONFIRM_RATE_LIMIT_SEC = 600;
export const PUBLIC_BOOKING_FALLBACK_CLIENT_KEY = "public_booking:missing_x_real_ip";

export type PublicBookingRateLimitKeyResult =
  | { ok: true; key: string }
  | { ok: false; reason: "missing_x_real_ip" };

/** First hop of `X-Forwarded-For`, which is the client as seen by the outermost proxy. */
function firstForwardedFor(request: Request): string | null {
  const raw = request.headers.get("x-forwarded-for");
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export function resolvePublicBookingRateLimitClientKey(request: Request): PublicBookingRateLimitKeyResult {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && real.length > 0) {
    return { ok: true, key: real };
  }
  if (env.NODE_ENV === "production") {
    logger.error({ msg: "public_booking_x_real_ip_required", scope: SCOPE });
    return { ok: false, reason: "missing_x_real_ip" };
  }
  const forwarded = firstForwardedFor(request);
  if (forwarded) {
    return { ok: true, key: `xff:${forwarded}` };
  }
  logger.debug({ msg: "public_booking_missing_x_real_ip", scope: SCOPE });
  return { ok: true, key: PUBLIC_BOOKING_FALLBACK_CLIENT_KEY };
}

export async function isPublicBookingCreateRateLimited(key: string): Promise<boolean> {
  return isPublicBookingCreateRateLimitedCore(key);
}

export async function isPublicBookingConfirmRateLimited(key: string): Promise<boolean> {
  return isPublicBookingConfirmRateLimitedCore(key);
}
