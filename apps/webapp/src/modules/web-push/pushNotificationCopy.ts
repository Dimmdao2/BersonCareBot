import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { isWarmupsContentSectionLinkedId } from "@/modules/reminders/resolveReminderIntentForLinkedObject";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";

export const WARMUP_PUSH_TITLE = "Разминка ⚡";
export const TRAINING_PUSH_TITLE = "Время тренировки";
export const MESSAGE_PUSH_TITLE = "Сообщение";
export const NEWS_PUSH_TITLE = "Новости";

export const LEGACY_SKIP_PUSH_CATEGORIES = new Set(["water", "breathing", "supplements_medication"]);

export type ReminderPushKind = "warmup" | "training" | "custom" | "skip";

export type WarmupPushDynamicContext = {
  dailyWarmupTitle?: string | null;
  /** Planned minus done today; only values > 0 are used in copy. */
  warmupsRemaining?: number | null;
};

const WARMUP_BODY_VARIANTS: readonly {
  key: string;
  fn: (ctx: WarmupPushDynamicContext) => string | null;
}[] = [
  { key: "move_now", fn: () => "Пора подвигаться!" },
  { key: "spine_health", fn: () => "5 минут разминки дарят + 5 лет здоровья позвоночнику" },
  { key: "take_break", fn: () => "Самое время сделать перерыв" },
  { key: "recharge", fn: () => "Заработался? Перезагрузись!" },
  { key: "movement_life", fn: () => "Движение – жизнь!" },
  {
    key: "daily_menu",
    fn: (ctx) => {
      const title = ctx.dailyWarmupTitle?.trim();
      return title ? `Сегодня в меню: ${title}` : null;
    },
  },
  {
    key: "remaining_goal",
    fn: (ctx) => {
      const n = ctx.warmupsRemaining;
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
      return formatWarmupsRemainingPhrase(n);
    },
  },
  { key: "after_warmup", fn: () => "А после разминки и думается лучше 😉" },
];

const TRAINING_BODY_POOL: readonly string[] = [
  "Реабилитация — билет к здоровью",
  "Пора позаботиться о себе",
  "Здоровое тело — большие возможности",
  "Пора стать ещё сильнее и здоровее",
  "Шаг за шагом — и всё получится.",
  "Давай сделаем, чтобы не болело!",
];

const TRAINING_BODY_KEYS = TRAINING_BODY_POOL.map((_, i) => `training_${i}`);

const APPOINTMENT_SPECIALIST_DATIVE = "Дмитрию";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function previewText(text: string, maxLen: number): string {
  const t = normalizeWhitespace(text);
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

export function stablePoolIndex(stableKey: string, poolSize: number): number {
  if (poolSize <= 0) return 0;
  const digest = createHash("sha256").update(stableKey).digest();
  const n = digest.readUInt32BE(0);
  return n % poolSize;
}

export function formatWarmupsRemainingPhrase(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  let word = "разминок";
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = "разминка";
    else if (mod10 >= 2 && mod10 <= 4) word = "разминки";
  }
  return `Ещё ${abs} ${word}, и цель выполнена!`;
}

export function classifyReminderPushKind(input: {
  linkedObjectType?: string | null;
  linkedObjectId?: string | null;
  reminderIntent?: string | null;
  occurrenceCategory?: string | null;
  openUrl?: string;
}): ReminderPushKind {
  const category = input.occurrenceCategory?.trim().toLowerCase() ?? "";
  if (category && LEGACY_SKIP_PUSH_CATEGORIES.has(category)) return "skip";

  const intent = input.reminderIntent?.trim().toLowerCase() ?? "";
  if (intent === "warmup") return "warmup";
  if (intent === "exercises" || intent === "stretch") return "training";

  const lot = input.linkedObjectType?.trim() ?? "";
  if (lot === "custom") return "custom";
  if (lot === "rehab_program" || lot === "treatment_program_item" || lot === "lfk_complex") return "training";
  if (lot === "content_page") return "training";
  if (lot === "content_section") {
    if (isWarmupsContentSectionLinkedId(input.linkedObjectId)) return "warmup";
    return "training";
  }

  const openUrl = input.openUrl ?? "";
  if (openUrl.includes("/go/daily-warmup") || openUrl.includes("daily-warmup")) return "warmup";
  if (openUrl.includes("/treatment/") || openUrl.includes("/go/plan") || openUrl.includes("/diary/lfk/")) {
    return "training";
  }

  if (category === "warmup") return "warmup";
  if (category === "exercise") return "training";

  return "training";
}

function pickWarmupVariant(
  ctx: WarmupPushDynamicContext,
  stableKey: string,
): { body: string; sloganKey: string } {
  const candidates = WARMUP_BODY_VARIANTS.map((v) => ({
    key: v.key,
    text: v.fn(ctx),
  })).filter((v): v is { key: string; text: string } => Boolean(v.text?.trim()));
  const pool =
    candidates.length > 0 ? candidates : [{ key: "fallback", text: "Пора подвигаться!" }];
  const picked = pool[stablePoolIndex(stableKey, pool.length)]!;
  return { body: picked.text, sloganKey: picked.key };
}

export function getWarmupSloganKey(stableKey: string, ctx: WarmupPushDynamicContext = {}): string {
  return pickWarmupVariant(ctx, stableKey).sloganKey;
}

export function buildWarmupPushCopy(
  stableKey: string,
  ctx: WarmupPushDynamicContext = {},
): { title: string; body: string; sloganKey: string } {
  const picked = pickWarmupVariant(ctx, stableKey);
  return {
    title: WARMUP_PUSH_TITLE,
    body: picked.body,
    sloganKey: picked.sloganKey,
  };
}

export function buildTrainingPushCopy(stableKey: string): {
  title: string;
  body: string;
  sloganKey: string;
} {
  const idx = stablePoolIndex(stableKey, TRAINING_BODY_POOL.length);
  const body = TRAINING_BODY_POOL[idx]!;
  return { title: TRAINING_PUSH_TITLE, body, sloganKey: TRAINING_BODY_KEYS[idx]! };
}

export function buildCustomReminderPushCopy(
  customTitle: string,
  customText: string,
): { title: string; body: string } {
  const title = normalizeWhitespace(customTitle).slice(0, 200) || "Напоминание";
  const bodyRaw = normalizeWhitespace(customText);
  const body = bodyRaw ? previewText(bodyRaw, 500) : previewText(title, 500);
  return { title, body };
}

export function buildMessagePushCopy(text: string): { title: string; body: string } {
  const trimmed = normalizeWhitespace(text);
  return {
    title: MESSAGE_PUSH_TITLE,
    body: previewText(trimmed, 120) || MESSAGE_PUSH_TITLE,
  };
}

export function buildNewsPushCopy(broadcastTitle: string): { title: string; body: string } {
  const body = normalizeWhitespace(broadcastTitle).slice(0, 500);
  return {
    title: NEWS_PUSH_TITLE,
    body: body || NEWS_PUSH_TITLE,
  };
}

export type AppointmentLifecycleVariant = "created" | "cancelled" | "rescheduled";

export function buildAppointmentLifecyclePushCopy(
  variant: AppointmentLifecycleVariant,
  slotStartIso: string,
  timeZone: string,
): { title: string; body: string } {
  const dateLabel = formatBookingDateTimeMediumRu(slotStartIso, timeZone);
  switch (variant) {
    case "created":
      return {
        title: "Запись на приём",
        body: `Вы записаны на приём ${dateLabel}`,
      };
    case "cancelled":
      return {
        title: "Отмена записи",
        body: `Отменена ваша запись на приём ${dateLabel}`,
      };
    case "rescheduled":
      return {
        title: "Перенос записи",
        body: `Перенесена ваша запись на приём — новая дата ${dateLabel}`,
      };
  }
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(value));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function buildAppointmentReminderPushCopy(
  slotStartIso: string,
  nowIso: string,
  timeZone: string,
): { title: string; body: string } {
  const start = DateTime.fromISO(slotStartIso, { zone: timeZone });
  const now = DateTime.fromISO(nowIso, { zone: timeZone });
  const diffHours = start.diff(now, "hours").hours;

  let remainder: string;
  if (!start.isValid || !now.isValid || diffHours <= 0) {
    remainder = "скоро";
  } else if (diffHours >= 24) {
    const days = Math.max(1, Math.round(diffHours / 24));
    const unit = pluralRu(days, "день", "дня", "дней");
    remainder = `${days} ${unit}`;
  } else {
    const hours = Math.max(1, Math.round(diffHours));
    const unit = pluralRu(hours, "час", "часа", "часов");
    remainder = `${hours} ${unit}`;
  }

  return {
    title: "Запись на приём",
    body: `До вашей записи к ${APPOINTMENT_SPECIALIST_DATIVE} осталось ${remainder}`,
  };
}

export type BuildReminderWebPushCopyInput = {
  stableKey: string;
  linkedObjectType?: string | null;
  linkedObjectId?: string | null;
  reminderIntent?: string | null;
  occurrenceCategory?: string | null;
  openUrl?: string;
  customTitle?: string | null;
  customText?: string | null;
  warmupContext?: WarmupPushDynamicContext;
};

export type ReminderWebPushCopyResult = {
  title: string;
  body: string;
  pushKind: Exclude<ReminderPushKind, "skip">;
  warmupSloganKey: string | null;
};

export function buildReminderWebPushCopy(
  input: BuildReminderWebPushCopyInput,
): ReminderWebPushCopyResult | null {
  const kind = classifyReminderPushKind(input);
  if (kind === "skip") return null;

  if (kind === "custom") {
    const title = input.customTitle?.trim() ?? "";
    if (!title) return null;
    const copy = buildCustomReminderPushCopy(title, input.customText?.trim() ?? "");
    return { ...copy, pushKind: "custom", warmupSloganKey: null };
  }

  if (kind === "warmup") {
    const copy = buildWarmupPushCopy(input.stableKey, input.warmupContext ?? {});
    return {
      title: copy.title,
      body: copy.body,
      pushKind: "warmup",
      warmupSloganKey: copy.sloganKey,
    };
  }

  const copy = buildTrainingPushCopy(input.stableKey);
  return {
    title: copy.title,
    body: copy.body,
    pushKind: "training",
    warmupSloganKey: null,
  };
}
