import type { AuthMethodsPayload } from './checkPhoneMethods';

/** Public UI projection of the platform auth-channel policy. */
export type AuthChannelUiPolicy = Readonly<{
  email: boolean;
  sms: boolean;
  telegram: boolean;
  max: boolean;
}>;

/** Missing public policy data must never make a channel appear enabled. */
export const FAIL_CLOSED_AUTH_CHANNEL_UI_POLICY: AuthChannelUiPolicy = Object.freeze({
  email: false,
  sms: false,
  telegram: false,
  max: false,
});

export function filterAuthMethodsByChannelPolicy(
  methods: AuthMethodsPayload,
  policy: AuthChannelUiPolicy,
): AuthMethodsPayload {
  return {
    ...methods,
    sms: methods.sms === true && policy.sms,
    telegram: methods.telegram === true && policy.telegram,
    max: methods.max === true && policy.max,
    email: methods.email === true && policy.email,
  };
}

/** Каналы доставки OTP в UI (вход / выбор способа). */
export type OtpUiChannel = 'sms' | 'telegram' | 'max' | 'email';

/** Публичный вход: SMS на сайте отключён; email и мессенджеры — по флагам `methods`. */
export const OTP_PUBLIC_OTHER_CHANNELS_ORDER: readonly OtpUiChannel[] = [
  'max',
  'email',
  'telegram',
];

/** Алиас: порядок альтернатив на шаге ввода кода (без SMS). */
export const OTP_PUBLIC_NON_SMS_CHANNELS_ORDER = OTP_PUBLIC_OTHER_CHANNELS_ORDER;

export function isOtpChannelAvailable(methods: AuthMethodsPayload, ch: OtpUiChannel): boolean {
  if (ch === 'sms') return methods.sms === true;
  if (ch === 'telegram') return !!methods.telegram;
  if (ch === 'max') return !!methods.max;
  return !!methods.email;
}

/** Публичный экран входа: SMS не предлагаем; email — если есть подтверждённый email в `methods`. */
export function isOtpChannelAvailablePublic(
  methods: AuthMethodsPayload,
  ch: OtpUiChannel,
): boolean {
  if (ch === 'sms') return false;
  return isOtpChannelAvailable(methods, ch);
}

/**
 * Публичный вход: Telegram → Max → email (SMS недоступен на сайте).
 * `null`, если нет ни одного канала (в т.ч. только SMS при выключенном email/мессенджерах).
 */
export function pickPrimaryOtpChannelPublic(methods: AuthMethodsPayload): OtpUiChannel | null {
  if (methods.telegram) return 'telegram';
  if (methods.max) return 'max';
  if (methods.email) return 'email';
  return null;
}

