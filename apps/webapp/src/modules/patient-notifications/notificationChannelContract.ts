import { logger } from "@/infra/logging/logger";
import type { PatientTopicChannelCode } from "./topicChannelRules";

/** Каналы уведомлений пациента (SMS не входит). */
export type NotificationChannelCode = PatientTopicChannelCode;

/** Единые reason-коды для webapp M2M и integrator worker. */
export type SkippedNotificationChannelReason =
  | "disabled_by_user_global"
  | "disabled_by_user_topic_channel"
  | "topic_disabled"
  | "muted"
  | "missing_binding"
  | "missing_email"
  | "email_not_verified"
  | "no_active_subscriptions"
  | "channel_not_allowed_for_topic"
  | "provider_disabled"
  | "vapid_missing"
  | "unsupported_intent_type"
  | "missing_recipient"
  | "rate_limited";

export type NotificationChannelDeliveryPath = "integrator_worker" | "webapp_m2m";

export type SkippedNotificationChannel = {
  channel: NotificationChannelCode;
  reason: SkippedNotificationChannelReason;
};

/** Результат резолвера каналов для темы и пользователя. */
export type ResolvedNotificationChannels = {
  userId: string;
  topicCode: string;
  integratorUserId?: string;
  selectedChannels: NotificationChannelCode[];
  skippedChannels: SkippedNotificationChannel[];
  availableChannels: NotificationChannelCode[];
  enabledChannels: NotificationChannelCode[];
};

export type ResolvedNotificationChannelsCore = Omit<
  ResolvedNotificationChannels,
  "userId" | "topicCode" | "integratorUserId"
>;

export function attachResolutionIdentity(
  core: ResolvedNotificationChannelsCore,
  identity: { userId: string; topicCode: string; integratorUserId?: string },
): ResolvedNotificationChannels {
  return {
    userId: identity.userId,
    topicCode: identity.topicCode,
    integratorUserId: identity.integratorUserId,
    ...core,
  };
}

export function logNotificationChannelsResolved(params: {
  resolution: ResolvedNotificationChannels;
  deliveryPath: NotificationChannelDeliveryPath;
  intentType?: string;
  /** Gate this routine `info` behind admin verbose flag (`debug_forward_to_admin`). */
  verbose: boolean;
}): void {
  const { resolution, deliveryPath, intentType, verbose } = params;
  if (!verbose) return;
  logger.info(
    {
      event: "notification_channels_resolved",
      userId: resolution.userId,
      integratorUserId: resolution.integratorUserId,
      topicCode: resolution.topicCode,
      intentType,
      deliveryPath,
      availableChannels: resolution.availableChannels,
      enabledChannels: resolution.enabledChannels,
      selectedChannels: resolution.selectedChannels,
      skippedChannels: resolution.skippedChannels,
    },
    "notification channels resolved",
  );
}
