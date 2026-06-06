/** Сегменты круговой диаграммы контактов (взаимоисключающие). */
export type ClientContactPieSegment =
  | "telegram_only"
  | "max_only"
  | "email_only"
  | "telegram_email"
  | "max_email"
  | "phone_email_no_messenger";

export const CLIENT_CONTACT_PIE_SEGMENT_LABELS: Record<ClientContactPieSegment, string> = {
  telegram_only: "Только ТГ",
  max_only: "Только Макс",
  email_only: "Только email",
  telegram_email: "ТГ + email",
  max_email: "Макс + email",
  phone_email_no_messenger: "Телефон + email",
};

export type ClientContactFlags = {
  hasTelegram: boolean;
  hasMax: boolean;
  hasVerifiedEmail: boolean;
  hasPhone: boolean;
};

export type ClientContactBreakdown = {
  total: number;
  /** Телефон в профиле, без мессенджеров и без подтверждённого email. */
  phoneOnly: number;
  /** Нет телефона, email, telegram, max — гость приложения. */
  appGuests: number;
  pie: Record<ClientContactPieSegment, number>;
  messengerBotBlocked: { telegram: number; max: number };
};

export function emptyClientContactBreakdown(): ClientContactBreakdown {
  return {
    total: 0,
    phoneOnly: 0,
    appGuests: 0,
    pie: {
      telegram_only: 0,
      max_only: 0,
      email_only: 0,
      telegram_email: 0,
      max_email: 0,
      phone_email_no_messenger: 0,
    },
    messengerBotBlocked: { telegram: 0, max: 0 },
  };
}

/** Один клиент попадает ровно в одну категорию: pie-сегмент, phoneOnly или appGuests. */
export function classifyClientContact(flags: ClientContactFlags): ClientContactPieSegment | "phone_only" | "app_guest" {
  const { hasTelegram, hasMax, hasVerifiedEmail, hasPhone } = flags;
  if (hasTelegram && hasVerifiedEmail) return "telegram_email";
  if (hasMax && hasVerifiedEmail && !hasTelegram) return "max_email";
  if (hasTelegram && !hasVerifiedEmail && !hasMax) return "telegram_only";
  if (hasMax && !hasVerifiedEmail && !hasTelegram) return "max_only";
  if (hasPhone && hasVerifiedEmail && !hasTelegram && !hasMax) return "phone_email_no_messenger";
  if (hasVerifiedEmail && !hasTelegram && !hasMax && !hasPhone) return "email_only";
  if (hasPhone && !hasVerifiedEmail && !hasTelegram && !hasMax) return "phone_only";
  if (!hasPhone && !hasVerifiedEmail && !hasTelegram && !hasMax) return "app_guest";
  return "app_guest";
}

export function accumulateClientContactBreakdown(
  breakdown: ClientContactBreakdown,
  flags: ClientContactFlags,
): void {
  breakdown.total += 1;
  const bucket = classifyClientContact(flags);
  if (bucket === "phone_only") {
    breakdown.phoneOnly += 1;
    return;
  }
  if (bucket === "app_guest") {
    breakdown.appGuests += 1;
    return;
  }
  breakdown.pie[bucket] += 1;
}
