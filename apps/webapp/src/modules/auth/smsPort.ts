/**
 * Порт интегратора SMS: отправка кода и проверка кода подтверждения.
 * Используется для авторизации по номеру телефона (web и messengers).
 *
 * Разграничение кодов:
 * - `invalid_phone` — номер не прошёл валидацию/контракт на нашей стороне.
 * - `delivery_failed` — сбой доставки или внешнего сервиса (HTTP/транспорт/502 и т.п.), не формат номера.
 */

export const SMS_ERROR_CODES = [
  'invalid_phone',
  'delivery_failed',
  'rate_limited',
  'too_many_attempts',
  'invalid_code',
  'expired_code',
] as const;

export type SmsErrorCode = (typeof SMS_ERROR_CODES)[number];

export type SendCodeResult =
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; code: SmsErrorCode; retryAfterSeconds?: number };

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; code: SmsErrorCode; retryAfterSeconds?: number };

/** Куда доставить OTP (код всегда в phone challenge store). */
export type PhoneOtpDelivery =
  | { channel: 'sms' }
  | { channel: 'telegram'; recipientId: string }
  | { channel: 'max'; recipientId: string }
  | { channel: 'email'; email: string };

export type DeferredPhoneOtpDelivery = {
  /**
   * Schedule delivery after the HTTP response. Challenge creation and resend accounting remain
   * synchronous so public login behaves the same for every phone number.
   */
  schedule(task: () => Promise<void>): void;
  /** Create an indistinguishable challenge without contacting a provider. */
  suppressDelivery?: boolean;
  /** Channel metadata the unavailable challenge must mirror for confirm-time policy checks. */
  challengeDeliveryChannel?: PhoneOtpDelivery['channel'];
  /** Optional background-only telemetry hook; it must never affect the public response. */
  onDeliveryResult?(result: SendCodeResult): Promise<void>;
};

export type SmsPort = {
  /** Генерирует код и challengeId, сохраняет в store (с code), отправляет SMS (через интегратор или заглушку). */
  sendCode(
    phone: string,
    ttlSec: number,
    delivery?: PhoneOtpDelivery,
    deferredDelivery?: DeferredPhoneOtpDelivery,
  ): Promise<SendCodeResult>;
  /** Проверка кода только в вебапп (по данным из store). */
  verifyCode(challengeId: string, code: string): Promise<VerifyCodeResult>;
};
