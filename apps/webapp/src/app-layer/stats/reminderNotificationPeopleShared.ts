export type ReminderPeopleDailyBucket = {
  /** Начало суток в `app_display_timezone`, текст из Postgres `date_trunc`. */
  bucket: string;
  peopleCount: number;
};

export type ReminderPeopleChannelSegment =
  | "only_push"
  | "only_telegram"
  | "only_max"
  | "multiple"
  | "no_channel";

export type ReminderPeopleChannelSlice = {
  segment: ReminderPeopleChannelSegment;
  label: string;
  peopleCount: number;
};

export type ReminderPeopleWithNotificationsStats = {
  /** Distinct people with ≥1 enabled reminder rule (today). */
  currentPeopleCount: number;
  daily: ReminderPeopleDailyBucket[];
  channelSegmentsToday: ReminderPeopleChannelSlice[];
};

const CHANNEL_SEGMENT_LABEL_RU: Record<ReminderPeopleChannelSegment, string> = {
  only_push: "Только Push",
  only_telegram: "Только Telegram",
  only_max: "Только MAX",
  multiple: "Несколько каналов",
  no_channel: "Нет канала",
};

const CHANNEL_SEGMENT_ORDER: ReminderPeopleChannelSegment[] = [
  "only_push",
  "only_telegram",
  "only_max",
  "multiple",
  "no_channel",
];

const CHANNEL_SEGMENT_COLORS: Record<ReminderPeopleChannelSegment, string> = {
  only_push: "hsl(215 60% 52%)",
  only_telegram: "hsl(200 70% 45%)",
  only_max: "hsl(280 45% 52%)",
  multiple: "hsl(38 75% 52%)",
  no_channel: "hsl(var(--muted-foreground) / 0.45)",
};

export function reminderPeopleChannelSegmentColor(segment: ReminderPeopleChannelSegment): string {
  return CHANNEL_SEGMENT_COLORS[segment];
}

export function classifyReminderDeliveryChannelSegment(flags: {
  hasPush: boolean;
  hasTelegram: boolean;
  hasMax: boolean;
}): ReminderPeopleChannelSegment {
  const active = [flags.hasPush, flags.hasTelegram, flags.hasMax].filter(Boolean).length;
  if (active === 0) return "no_channel";
  if (active > 1) return "multiple";
  if (flags.hasPush) return "only_push";
  if (flags.hasTelegram) return "only_telegram";
  return "only_max";
}

export function aggregateReminderPeopleChannelSegments(
  rows: Array<{ hasPush: boolean; hasTelegram: boolean; hasMax: boolean }>,
): ReminderPeopleChannelSlice[] {
  const counts = new Map<ReminderPeopleChannelSegment, number>();
  for (const segment of CHANNEL_SEGMENT_ORDER) {
    counts.set(segment, 0);
  }
  for (const row of rows) {
    const segment = classifyReminderDeliveryChannelSegment(row);
    counts.set(segment, (counts.get(segment) ?? 0) + 1);
  }
  return CHANNEL_SEGMENT_ORDER.map((segment) => ({
    segment,
    label: CHANNEL_SEGMENT_LABEL_RU[segment],
    peopleCount: counts.get(segment) ?? 0,
  })).filter((s) => s.peopleCount > 0);
}
