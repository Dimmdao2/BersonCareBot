import type { ChannelPreference } from "@/modules/channel-preferences/types";
import type { TopicChannelPrefRow } from "./topicChannelPrefsPort";
import {
  allowedChannelsForTopic,
  type PatientTopicChannelCode,
} from "./topicChannelRules";

export type SkippedNotificationChannelReason =
  | "disabled_by_user_global"
  | "disabled_by_user_topic"
  | "missing_binding"
  | "missing_email"
  | "email_not_verified"
  | "no_active_subscriptions"
  | "vapid_missing"
  | "channel_not_allowed_for_topic"
  | "topic_disabled"
  | "muted"
  | "smtp_missing"
  | "rate_limited";

export type PatientNotificationChannelAvailability = {
  hasTelegram: boolean;
  hasMax: boolean;
  hasEmail: boolean;
  emailVerified: boolean;
  hasWebPushSubscription: boolean;
  vapidConfigured: boolean;
  smtpConfigured?: boolean;
};

export type NotificationTopicGate = {
  muted: boolean;
  topicMasterEnabled: boolean;
};

export type ResolvedNotificationChannels = {
  selectedChannels: PatientTopicChannelCode[];
  skippedChannels: Array<{ channel: PatientTopicChannelCode; reason: SkippedNotificationChannelReason }>;
  availableChannels: PatientTopicChannelCode[];
  enabledChannels: PatientTopicChannelCode[];
};

function resolveTopicChannelEnabled(
  rows: TopicChannelPrefRow[],
  topicCode: string,
  channelCode: PatientTopicChannelCode,
): boolean {
  const row = rows.find((r) => r.topicCode === topicCode && r.channelCode === channelCode);
  return row ? row.isEnabled : true;
}

function globalNotificationsEnabled(
  prefs: ChannelPreference[],
  channelCode: PatientTopicChannelCode,
): boolean {
  const row = prefs.find((p) => p.channelCode === channelCode);
  return row ? row.isEnabledForNotifications !== false : true;
}

/**
 * Единая бизнес-логика выбора каналов доставки для темы (push / email / мессенджеры).
 */
export function resolvePatientNotificationChannels(params: {
  topicCode: string;
  availability: PatientNotificationChannelAvailability;
  channelPrefs: ChannelPreference[];
  topicChannelRows: TopicChannelPrefRow[];
  gate?: NotificationTopicGate;
}): ResolvedNotificationChannels {
  const topicCode = params.topicCode.trim();
  const allowed = allowedChannelsForTopic(topicCode);
  const availableChannels: PatientTopicChannelCode[] = [];
  const enabledChannels: PatientTopicChannelCode[] = [];
  const selectedChannels: PatientTopicChannelCode[] = [];
  const skippedChannels: ResolvedNotificationChannels["skippedChannels"] = [];

  const gate = params.gate;
  if (gate?.muted) {
    for (const code of allowed) {
      skippedChannels.push({ channel: code, reason: "muted" });
    }
    return { selectedChannels, skippedChannels, availableChannels, enabledChannels };
  }
  if (gate && !gate.topicMasterEnabled) {
    for (const code of allowed) {
      skippedChannels.push({ channel: code, reason: "topic_disabled" });
    }
    return { selectedChannels, skippedChannels, availableChannels, enabledChannels };
  }

  const { availability: a, channelPrefs, topicChannelRows } = params;

  const consider = (code: PatientTopicChannelCode) => {
    if (!allowed.includes(code)) {
      skippedChannels.push({ channel: code, reason: "channel_not_allowed_for_topic" });
      return;
    }

    let physicallyAvailable = false;
    switch (code) {
      case "telegram":
        physicallyAvailable = a.hasTelegram;
        if (!physicallyAvailable) {
          skippedChannels.push({ channel: code, reason: "missing_binding" });
          return;
        }
        break;
      case "max":
        physicallyAvailable = a.hasMax;
        if (!physicallyAvailable) {
          skippedChannels.push({ channel: code, reason: "missing_binding" });
          return;
        }
        break;
      case "email":
        if (!a.hasEmail) {
          skippedChannels.push({ channel: code, reason: "missing_email" });
          return;
        }
        if (!a.emailVerified) {
          skippedChannels.push({ channel: code, reason: "email_not_verified" });
          return;
        }
        if (a.smtpConfigured === false) {
          skippedChannels.push({ channel: code, reason: "smtp_missing" });
          return;
        }
        physicallyAvailable = true;
        break;
      case "web_push":
        if (!a.vapidConfigured) {
          skippedChannels.push({ channel: code, reason: "vapid_missing" });
          return;
        }
        if (!a.hasWebPushSubscription) {
          skippedChannels.push({ channel: code, reason: "no_active_subscriptions" });
          return;
        }
        physicallyAvailable = true;
        break;
      default:
        return;
    }

    availableChannels.push(code);

    if (!globalNotificationsEnabled(channelPrefs, code)) {
      skippedChannels.push({ channel: code, reason: "disabled_by_user_global" });
      return;
    }
    if (!resolveTopicChannelEnabled(topicChannelRows, topicCode, code)) {
      skippedChannels.push({ channel: code, reason: "disabled_by_user_topic" });
      return;
    }

    enabledChannels.push(code);
    selectedChannels.push(code);
  };

  for (const code of ["web_push", "telegram", "max", "email"] as const) {
    consider(code);
  }

  return { selectedChannels, skippedChannels, availableChannels, enabledChannels };
}
