/**
 * Shared notification channel resolution shape (mirrors webapp `notificationChannelContract`).
 * Integrator does not import webapp; keep in sync manually.
 */

export type NotificationChannelCode = 'telegram' | 'max' | 'web_push' | 'email';

export type SkippedNotificationChannelReason =
  | 'disabled_by_user_global'
  | 'disabled_by_user_topic_channel'
  | 'topic_disabled'
  | 'muted'
  | 'missing_binding'
  | 'missing_email'
  | 'email_not_verified'
  | 'no_active_subscriptions'
  | 'channel_not_allowed_for_topic'
  | 'provider_disabled'
  | 'vapid_missing'
  | 'unsupported_intent_type'
  | 'missing_recipient'
  | 'rate_limited';

export type ResolvedNotificationChannelsPayload = {
  userId: string;
  topicCode: string;
  integratorUserId?: string;
  selectedChannels: NotificationChannelCode[];
  skippedChannels: Array<{ channel: NotificationChannelCode; reason: SkippedNotificationChannelReason }>;
  availableChannels: NotificationChannelCode[];
  enabledChannels: NotificationChannelCode[];
};

export type DeliveryTargetsFetchResult = {
  channelBindings: Record<string, string>;
  resolution?: ResolvedNotificationChannelsPayload;
};
