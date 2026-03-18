/**
 * Порт интегратора SMS: отправка кода и проверка кода подтверждения.
 * Используется для авторизации по номеру телефона (web и messengers).
 */

export const SMS_ERROR_CODES = [
  "invalid_phone",
  "rate_limited",
  "too_many_attempts",
  "invalid_code",
  "expired_code",
] as const;

export type SmsErrorCode = (typeof SMS_ERROR_CODES)[number];

export type SendCodeResult =
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; code: SmsErrorCode; retryAfterSeconds?: number };

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; code: SmsErrorCode; retryAfterSeconds?: number };

export type SmsPort = {
  /** Генерирует код и challengeId, сохраняет в store (с code), отправляет SMS (через интегратор или заглушку). */
  sendCode(phone: string, ttlSec: number): Promise<SendCodeResult>;
  /** Проверка кода только в вебапп (по данным из store). */
  verifyCode(challengeId: string, code: string): Promise<VerifyCodeResult>;
};
