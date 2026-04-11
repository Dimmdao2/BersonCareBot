import type { AuthMethodsPayload } from "./checkPhoneMethods";

/** Каналы доставки OTP в UI (вход / выбор способа). */
export type OtpUiChannel = "sms" | "telegram" | "max" | "email";

/**
 * Приоритет основного канала: Telegram → Max → email → SMS
 * (полный набор; для публичного входа без email см. `pickPrimaryOtpChannelPublic`).
 */
export function pickPrimaryOtpChannel(methods: AuthMethodsPayload): OtpUiChannel {
  if (methods.telegram) return "telegram";
  if (methods.max) return "max";
  if (methods.email) return "email";
  return "sms";
}

/** Порядок в блоке «Другие способы»: мессенджеры и email, СМС последним. */
export const OTP_OTHER_CHANNELS_ORDER: readonly OtpUiChannel[] = ["max", "email", "telegram", "sms"];

/** Публичный вход: без email. SMS на сайте отключён — только мессенджеры. */
export const OTP_PUBLIC_OTHER_CHANNELS_ORDER: readonly OtpUiChannel[] = ["max", "telegram"];

/** Алиас: порядок альтернатив на шаге ввода кода (без SMS). */
export const OTP_PUBLIC_NON_SMS_CHANNELS_ORDER = OTP_PUBLIC_OTHER_CHANNELS_ORDER;

export function isOtpChannelAvailable(methods: AuthMethodsPayload, ch: OtpUiChannel): boolean {
  if (ch === "sms") return methods.sms === true;
  if (ch === "telegram") return !!methods.telegram;
  if (ch === "max") return !!methods.max;
  return !!methods.email;
}

/** Публичный экран входа: email не предлагаем. */
export function isOtpChannelAvailablePublic(methods: AuthMethodsPayload, ch: OtpUiChannel): boolean {
  if (ch === "email") return false;
  return isOtpChannelAvailable(methods, ch);
}

/**
 * Публичный вход: главная кнопка — только Telegram / Max (SMS только через «Другие способы»).
 * `null`, если доступен только SMS или только email у иностранного номера.
 */
export function pickPrimaryOtpChannelPublic(methods: AuthMethodsPayload): OtpUiChannel | null {
  if (methods.telegram) return "telegram";
  if (methods.max) return "max";
  return null;
}

/**
 * Если пользователь выбрал канал в профиле и он доступен — используем его;
 * иначе стандартный приоритет Telegram → Max → email → SMS.
 */
export function pickOtpChannelWithPreference(
  methods: AuthMethodsPayload,
  preferred: OtpUiChannel | null | undefined,
): OtpUiChannel {
  if (preferred && isOtpChannelAvailable(methods, preferred)) return preferred;
  return pickPrimaryOtpChannel(methods);
}

/**
 * Публичный вход: предпочтение из профиля учитывается только если это не email.
 */
export function pickOtpChannelWithPreferencePublic(
  methods: AuthMethodsPayload,
  preferred: OtpUiChannel | null | undefined,
): OtpUiChannel | null {
  if (
    preferred &&
    preferred !== "email" &&
    preferred !== "sms" &&
    isOtpChannelAvailablePublic(methods, preferred)
  ) {
    return preferred;
  }
  return pickPrimaryOtpChannelPublic(methods);
}
