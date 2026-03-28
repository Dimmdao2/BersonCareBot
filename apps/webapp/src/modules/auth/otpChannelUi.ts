import type { AuthMethodsPayload } from "./checkPhoneMethods";

/** Каналы доставки OTP в UI (вход / выбор способа). */
export type OtpUiChannel = "sms" | "telegram" | "max" | "email";

/**
 * Приоритет основного канала: Telegram → Max → email → SMS
 * (совпадает с авто-отправкой в AuthFlowV2).
 */
export function pickPrimaryOtpChannel(methods: AuthMethodsPayload): OtpUiChannel {
  if (methods.telegram) return "telegram";
  if (methods.max) return "max";
  if (methods.email) return "email";
  return "sms";
}

/** Порядок в блоке «Другие способы»: мессенджеры и email, СМС последним. */
export const OTP_OTHER_CHANNELS_ORDER: readonly OtpUiChannel[] = ["max", "email", "telegram", "sms"];

export function isOtpChannelAvailable(methods: AuthMethodsPayload, ch: OtpUiChannel): boolean {
  if (ch === "sms") return true;
  if (ch === "telegram") return !!methods.telegram;
  if (ch === "max") return !!methods.max;
  return !!methods.email;
}

/**
 * Если пользователь выбрал канал в профиле и он доступен — используем его;
 * иначе стандартный приоритет Telegram → Max → email → SMS.
 */
export function pickOtpChannelWithPreference(
  methods: AuthMethodsPayload,
  preferred: OtpUiChannel | null | undefined
): OtpUiChannel {
  if (preferred && isOtpChannelAvailable(methods, preferred)) return preferred;
  return pickPrimaryOtpChannel(methods);
}
