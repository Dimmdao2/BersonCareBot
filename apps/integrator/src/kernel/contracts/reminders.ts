export const REMINDER_CATEGORIES = [
  'exercise',
  'warmup',
  'breathing',
  'water',
  'supplements_medication',
] as const;

export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

export const REMINDER_SCHEDULE_PRESETS = [
  'daily',
  'twice_daily',
  'every_3_hours',
] as const;

export type ReminderSchedulePreset = (typeof REMINDER_SCHEDULE_PRESETS)[number];

export type ReminderContentMode = 'none' | 'random_from_collection' | 'fixed_item';

export type ReminderRuleRecord = {
  id: string;
  userId: string;
  category: ReminderCategory;
  isEnabled: boolean;
  scheduleType: string;
  timezone: string;
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
  contentMode: ReminderContentMode;
  createdAt?: string;
  updatedAt?: string;
  /** Webapp projection (optional): linked object + deep link for bot payloads */
  linkedObjectType?: string | null;
  linkedObjectId?: string | null;
  customTitle?: string | null;
  customText?: string | null;
  deepLink?: string | null;
  /** Webapp `slots_v1` JSON; null for `interval_window`. */
  scheduleData?: unknown;
  /** Webapp `reminder_intent` (warmup | exercises | stretch | generic). */
  reminderIntent?: string | null;
  /** Webapp rehab-only display strings from projection. */
  displayTitle?: string | null;
  displayDescription?: string | null;
};

export type ReminderOccurrenceStatus =
  | 'planned'
  | 'queued'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'expired';

export type ReminderOccurrenceRecord = {
  id: string;
  ruleId: string;
  occurrenceKey: string;
  plannedAt: string;
  status: ReminderOccurrenceStatus;
  queuedAt?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
  deliveryChannel?: string | null;
  deliveryJobId?: string | null;
  errorCode?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DueReminderOccurrence = ReminderOccurrenceRecord & {
  userId: string;
  category: ReminderCategory;
  timezone: string;
  channelId: string;
  chatId: number;
};

export const CONTENT_CATALOG_SECTIONS = [
  'useful_lessons',
  'emergency_help',
  'free_materials',
  'courses',
  'exercise',
  'warmup',
  'movement',
] as const;

export type ContentCatalogSection = (typeof CONTENT_CATALOG_SECTIONS)[number];

export type ContentCatalogItem = {
  id: string;
  title: string;
  kind: string;
  durationMinutes?: number;
  tags?: string[];
  targetUrlBase?: string;
};

export type IssuedContentAccess = {
  grantId: string;
  url: string;
  expiresAt: string;
};
