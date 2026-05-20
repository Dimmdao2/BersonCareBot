/** Обратный отсчёт до повторной отправки SMS/email challenge. */
export const OTP_RESEND_COOLDOWN_SEC = 60;

/** Максимум неверных попыток ввода кода до блокировки. */
export const OTP_MAX_VERIFY_ATTEMPTS = 4;

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
