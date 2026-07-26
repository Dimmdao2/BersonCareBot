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

/** Длительность блокировки после превышения попыток (секунды). */
export const OTP_LOCK_DURATION_SEC = 600;

export const OTP_TOO_MANY_ATTEMPTS_MESSAGE =
  "Превышено количество попыток. Запросите новый код через 10 минут.";

/** Сообщение для rate limit / cooldown с обратным отсчётом. */
export function formatOtpRetryAfterMessage(retryAfterSeconds: number): string {
  const sec = Math.max(1, Math.ceil(retryAfterSeconds));
  if (sec >= 120) {
    const min = Math.ceil(sec / 60);
    return `Повторите через ${min} мин.`;
  }
  return `Повторите через ${sec} сек.`;
}
