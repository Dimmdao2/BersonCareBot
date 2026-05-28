/** Sentinel for rollup dimensions not applicable to a row (hourly composite PK). */
export const PRODUCT_ANALYTICS_DIM_ALL = "__all__";

export const PRODUCT_ANALYTICS_EVENT_TYPES = [
  "auth_login",
  "auth_register_attempt",
  "auth_register_success",
  "auth_register_failure",
  "app_open",
  "page_view",
  "push_open",
  "heartbeat",
  "push_sent",
] as const;

export const AUTH_REGISTRATION_EVENT_TYPES = [
  "auth_register_attempt",
  "auth_register_success",
  "auth_register_failure",
] as const;

export type AuthRegistrationEventType = (typeof AUTH_REGISTRATION_EVENT_TYPES)[number];

export type AuthRegistrationEventListRow = {
  id: string;
  occurredAt: string;
  eventType: AuthRegistrationEventType;
  entryChannel: ProductAnalyticsEntryChannel;
  userId: string | null;
  metadata: Record<string, unknown>;
};

export type ListRegistrationEventsParams = {
  startIso: string;
  endExclusiveIso: string;
  eventType?: AuthRegistrationEventType;
  errorClass?: "user" | "system";
  authMethod?: string;
  page: number;
  limit: number;
};

export type ListRegistrationEventsResult = {
  items: AuthRegistrationEventListRow[];
  total: number;
  page: number;
  limit: number;
};

export type ProductAnalyticsEventType = (typeof PRODUCT_ANALYTICS_EVENT_TYPES)[number];

export const PRODUCT_ANALYTICS_ENTRY_CHANNELS = ["pwa", "telegram", "max", "browser"] as const;

export type ProductAnalyticsEntryChannel = (typeof PRODUCT_ANALYTICS_ENTRY_CHANNELS)[number];

export type ProductAnalyticsIngestEvent = {
  eventType: ProductAnalyticsEventType;
  entryChannel: ProductAnalyticsEntryChannel;
  occurredAt?: string;
  pageKey?: string | null;
  userId?: string | null;
  clientSessionId?: string | null;
  pushTrackingId?: string | null;
  topicCode?: string | null;
  pushKind?: string | null;
  warmupSloganKey?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreatePushNotificationInput = {
  id: string;
  userId: string;
  topicCode?: string | null;
  intentType?: string | null;
  occurrenceId?: string | null;
  pushKind?: string | null;
  warmupSloganKey?: string | null;
  warmupSloganText?: string | null;
  openUrl?: string | null;
  title?: string | null;
  createdAt?: string;
};

export type RecordPushOpenInput = {
  pushTrackingId: string;
  userId?: string | null;
  entryChannel?: ProductAnalyticsEntryChannel;
  occurredAt?: string;
};

export type ProductAnalyticsAdminSummary = {
  uniqueActiveUsers: number;
  totalAuthLogins: number;
  totalAppOpens: number;
  totalPageViews: number;
  totalActiveMinutes: number;
  totalPushSent: number;
  totalPushOpens: number;
  pushOpenRate: number;
};

export type ProductAnalyticsEntryChannelHourlyRow = {
  bucket: string;
  pwa: number;
  telegram: number;
  max: number;
  browser: number;
};

export type ProductAnalyticsEntryChannelTotalRow = {
  entryChannel: ProductAnalyticsEntryChannel;
  appOpens: number;
};

export type ProductAnalyticsTopPageRow = {
  pageKey: string;
  views: number;
  uniqueUsers: number;
};

export type ProductAnalyticsPageViewsHourlyRow = {
  bucket: string;
  pageKey: string;
  views: number;
  uniqueUsers: number;
};

export type ProductAnalyticsPushByTopicRow = {
  topicCode: string;
  sent: number;
  opened: number;
  openRate: number;
};

export type ProductAnalyticsWarmupSloganRow = {
  sloganKey: string;
  sent: number;
  opened: number;
  openRate: number;
  sampleText: string | null;
};

export type ProductAnalyticsActiveUsersDailyRow = {
  day: string;
  activeUsers: number;
};

export type ProductAnalyticsClientChannelStatsRow = {
  entryChannel: ProductAnalyticsEntryChannel;
  appOpens: number;
  pageViews: number;
  pushOpens: number;
  activeMinutes: number;
  totalActivity: number;
};

export type ProductAnalyticsClientActivityRow = {
  userId: string;
  displayName: string;
  lastSeenAt: string | null;
  appOpens: number;
  pageViews: number;
  pushOpens: number;
  activeMinutes: number;
  totalActivity: number;
  channels: ProductAnalyticsClientChannelStatsRow[];
};

export type ProductAnalyticsAdminDashboard = {
  windowHours: number;
  /** IANA `app_display_timezone` — бакеты графиков в этом поясе. */
  displayTimezone: string;
  generatedAt: string;
  summary: ProductAnalyticsAdminSummary;
  entryChannelHourly: ProductAnalyticsEntryChannelHourlyRow[];
  entryChannelTotals: ProductAnalyticsEntryChannelTotalRow[];
  topPages: ProductAnalyticsTopPageRow[];
  pageViewsHourly: ProductAnalyticsPageViewsHourlyRow[];
  pushByTopic: ProductAnalyticsPushByTopicRow[];
  warmupSlogans: ProductAnalyticsWarmupSloganRow[];
  activeUsersDaily: ProductAnalyticsActiveUsersDailyRow[];
  clientActivity: ProductAnalyticsClientActivityRow[];
};
