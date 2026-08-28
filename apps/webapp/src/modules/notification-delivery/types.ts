export const NOTIFICATION_DELIVERY_CHANNELS = ['telegram', 'max', 'web_push', 'email'] as const;

export type NotificationDeliveryChannel = (typeof NOTIFICATION_DELIVERY_CHANNELS)[number];

export const NOTIFICATION_DELIVERY_STATUSES = ['success', 'failed', 'skipped'] as const;

export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export type RecordNotificationDeliveryAttemptInput = {
  userId?: string;
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
  /** Confirmed sends of this channel from the canonical queue — never from the attempt journal. */
  successCount: number;
  failedCount: number;
  skippedCount: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastProviderStatusCode: number | null;
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

/**
 * Audit §C2. `notification_delivery_attempts` is a FAILURE-ONLY journal since 20260826T170000, so a
 * channel aggregate can no longer answer "did anything get delivered". These three facts come from
 * the CANONICAL delivery lifecycle (`outgoing_delivery_queue`, rows that reached `sent`) and are the
 * only positive evidence the health card has.
 */
export type NotificationDeliveryConfirmedFacts = {
  /** Rows that reached `sent` in the window. Zero + a due backlog is an outage, not a quiet day. */
  confirmedDeliveries24h: number;
  lastConfirmedDeliveryAt: string | null;
};

export type NotificationDeliveryHealthSnapshot = {
  windowHours: number;
  byChannel: Record<NotificationDeliveryChannel, NotificationDeliveryChannelAggregate>;
  recentIssues: NotificationDeliveryRecentIssue[];
  /** FAILED/SKIPPED provider attempts recorded in the failure-only journal within the window. */
  totalAttempts24h: number;
} & NotificationDeliveryConfirmedFacts;

export type NotificationDeliverySystemHealthStatus =
  | 'ok'
  | 'degraded'
  | 'no_data'
  | 'not_configured'
  | 'error';
