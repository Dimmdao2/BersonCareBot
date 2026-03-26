/** Обратный отсчёт до повторной отправки SMS/email challenge. */
export const OTP_RESEND_COOLDOWN_SEC = 60;

/** Максимум неверных попыток ввода кода до блокировки. */
export const OTP_MAX_VERIFY_ATTEMPTS = 3;

/** Длительность блокировки после превышения попыток (секунды). */
export const OTP_LOCK_DURATION_SEC = 600;

export const OTP_TOO_MANY_ATTEMPTS_MESSAGE =
  "Превышено количество попыток. Запросите новый код через 10 минут.";
