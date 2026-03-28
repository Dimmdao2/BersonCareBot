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
