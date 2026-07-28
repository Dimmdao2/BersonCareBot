/** Обратный отсчёт до повторной отправки SMS/email challenge. */
export const OTP_RESEND_COOLDOWN_SEC = 60;

/**
 * Максимум неверных попыток ввода кода до блокировки.
 * Standardized at 5 (night plan C-2, step 1): Twilio Verify's proven default, matching the
 * hardcoded `attempts >= 5` already live in `app.email_otp_public_consume_latest_challenge`
 * (0232_email_otp_atomic_consume.sql) -- the repo previously had both 4 (this constant, used by the
 * authenticated email/phone-login engines) and 5 (that one public engine) live at once. 5 is the
 * *loosening* direction from 4, so it cannot lock out a real user who fat-fingers a code on their
 * first or second try.
 */
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

/**
 * Flat lock duration (seconds) -- kept ONLY for the anonymous A-3 public-booking OTP engines
 * (`app.phone_otp_public_booking_consume_challenge` / `app.email_otp_public_consume_latest_challenge`,
 * migrations 0245/0232), which are out of scope for the decaying-lockout work below (night plan
 * C-2 step 3 covers only the authenticated email/phone login+registration engines step 1 made
 * atomic: `phoneOtpLimits.ts`/`PhoneChallengeStore` and `emailAuth.ts`/`email_auth_*`). Do not wire
 * this constant into any NEW lockout path -- see OTP_LOCKOUT_BASE_SEC below.
 */
export const OTP_LOCK_DURATION_SEC = 600;

/**
 * Decaying OTP lockout curve (night plan C-2 step 3), replacing the flat 10-minute block above for
 * the authenticated email/phone engines.
 *
 * Sources (owner ruling: "не изобретай" -- the curve comes from named standards, not taste):
 *  - NIST SP 800-63B §5.2.2: approved throttling includes "a period of time that increases as the
 *    account approaches its maximum allowance" (example range 30 seconds up to an hour).
 *  - OWASP Authentication Cheat Sheet: "exponential lockout, where the lockout duration starts...
 *    very short... but doubles after each failed login attempt"; warns an uncapped lockout "can be
 *    weaponized... to cause a denial of service" -- hence the hard cap.
 *  - NIST SP 800-63B §5.2.2: "disregard any previous failed attempts... after successful
 *    authentication" -- the escalation cycle resets to 0 on the next success, it does not merely
 *    decay with time.
 *
 * Shape (lead's decision from that research): first lockout ~2 min, doubling on each subsequent
 * cycle, hard cap 30 min, cycle resets on the next success. Owner constraint: no state this curve
 * can reach may leave a legitimate user/clinic locked out for longer than the cap with no
 * self-service path back -- explicitly NOT Auth0's default shape (10 failures -> block that expires
 * only after 30 days, manual/e-mail unblock).
 */
export const OTP_LOCKOUT_BASE_SEC = 120; // 2 minutes -- first lockout.
export const OTP_LOCKOUT_CAP_SEC = 1800; // 30 minutes -- hard cap, always reachable by waiting.
/** Exponent safety cap -- same value as the `LEAST(..., 10)` in
 * app.email_auth_register_email_otp_lockout (0248) and pgPhoneOtpLimits.ts:registerPhoneOtpLockout,
 * kept numerically identical on purpose. 120 * 2^10s already exceeds the 1800s cap by two orders of
 * magnitude, so this never changes the resulting duration -- it only keeps the exponentiation itself
 * cheap and far from any numeric range concern for a cycle counter that (by design) never needs to
 * grow large. */
const OTP_LOCKOUT_EXPONENT_CAP = 10;

/**
 * Duration (seconds) of the NEXT lockout, given the number of lockout cycles already completed
 * since the last successful verification (0 for "never locked, or reset by a success").
 * `previousCycles = 0` -> 120s (2 min, matches the INSERT branch of the SQL accessors below, which
 * this function must stay numerically identical to -- see
 * app.email_auth_register_email_otp_lockout (0248) and pgPhoneOtpLimits.ts:registerPhoneOtpLockout).
 */
export function nextOtpLockoutDurationSeconds(previousCycles: number): number {
  const exponent = Math.min(Math.max(0, Math.trunc(previousCycles)), OTP_LOCKOUT_EXPONENT_CAP);
  return Math.min(OTP_LOCKOUT_CAP_SEC, OTP_LOCKOUT_BASE_SEC * 2 ** exponent);
}

export const OTP_TOO_MANY_ATTEMPTS_MESSAGE =
  'Превышено количество попыток. Запросите новый код через 10 минут.';

/** Сообщение для rate limit / cooldown с обратным отсчётом. */
export function formatOtpRetryAfterMessage(retryAfterSeconds: number): string {
  const sec = Math.max(1, Math.ceil(retryAfterSeconds));
  if (sec >= 120) {
    const min = Math.ceil(sec / 60);
    return `Повторите через ${min} мин.`;
  }
  return `Повторите через ${sec} сек.`;
}
