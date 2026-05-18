export const NOTIFICATION_DELIVERY_CHANNELS = ["telegram", "max", "web_push", "email"] as const;

export type NotificationDeliveryChannel = (typeof NOTIFICATION_DELIVERY_CHANNELS)[number];

export const NOTIFICATION_DELIVERY_STATUSES = ["success", "failed", "skipped"] as const;

export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export type RecordNotificationDeliveryAttemptInput = {
  userId?: string;
  integratorUserId?: string;
  topicCode?: string;
  intentType?: string;
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryStatus;
  reason?: string;
  providerStatusCode?: number;
  eventId?: string;
  occurrenceId?: string;
  endpointHash?: string;
  recipientRef?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export type NotificationDeliveryChannelAggregate = {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorReason: string | null;
  lastErrorMessage: string | null;
};

export type NotificationDeliveryRecentIssue = {
  createdAt: string;
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryStatus;
  reason: string | null;
  topicCode: string | null;
  recipientRef: string | null;
  userId: string | null;
  errorMessage: string | null;
};

export type NotificationDeliveryHealthSnapshot = {
  windowHours: number;
  byChannel: Record<NotificationDeliveryChannel, NotificationDeliveryChannelAggregate>;
  recentIssues: NotificationDeliveryRecentIssue[];
  totalAttempts24h: number;
};

export type NotificationDeliverySystemHealthStatus =
  | "ok"
  | "degraded"
  | "no_data"
  | "not_configured";
