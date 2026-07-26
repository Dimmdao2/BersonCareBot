/**
 * Single chokepoint for the per-IP rate limit shared by every OTP/code CONFIRM route that had none
 * (night plan C-2, step 2): `phone/confirm`, `email-otp/confirm`, `email-password/reset`,
 * `email-password/setup-code/complete`, `specialist-signup/confirm`, `email/confirm`,
 * `phone/messenger-bind/finish`, `patient/diary/purge`. Each route calls `checkAuthConfirmRateLimit`
 * once, before parsing the body, and maps the result onto its OWN existing failure shape (ASVS 6.3.8:
 * a rate-limited response must not differ in shape from an ordinary failure) -- this module only
 * resolves the IP key and asks the limiter; it never renders a response itself.
 */
import { isAuthConfirmRateLimitedByKey } from "@/modules/auth/authRateLimits";
import { resolveRealIpRateLimitClientKey } from "@/modules/auth/realIpRateLimitClientKey";

/** Same figure the limiter itself uses (`auth.confirm`, 30/10min) -- see authRateLimits.ts for the rationale. */
export const AUTH_CONFIRM_RATE_LIMIT_SEC = 600;

export type AuthConfirmRateLimitResult =
  | { limited: false }
  | { limited: true; reason: "rate_limited" }
  | { limited: true; reason: "proxy_configuration" };

/**
 * @param routeTag short, stable tag for logs only (e.g. "phone_confirm") -- never rendered to the caller.
 */
export async function checkAuthConfirmRateLimit(
  request: Request,
  routeTag: string,
): Promise<AuthConfirmRateLimitResult> {
  const identity = resolveRealIpRateLimitClientKey(request, {
    scope: "auth.confirm",
    logPrefix: `auth_confirm_${routeTag}`,
    fallbackKey: "auth_confirm:missing_x_real_ip",
  });
  if (!identity.ok) {
    return { limited: true, reason: "proxy_configuration" };
  }
  if (await isAuthConfirmRateLimitedByKey(identity.key)) {
    return { limited: true, reason: "rate_limited" };
  }
  return { limited: false };
}
