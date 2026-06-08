import type { ChannelPreference } from "@/modules/channel-preferences/types";
import type {
  NotificationChannelCode,
  ResolvedNotificationChannelsCore,
  SkippedNotificationChannel,
  SkippedNotificationChannelReason,
} from "./notificationChannelContract";
import type { TopicChannelPrefRow } from "./topicChannelPrefsPort";
import { allowedChannelsForTopic } from "./topicChannelRules";

export type { NotificationChannelCode, SkippedNotificationChannelReason } from "./notificationChannelContract";

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

function resolveTopicChannelEnabled(
  rows: TopicChannelPrefRow[],
  topicCode: string,
  channelCode: NotificationChannelCode,
): boolean {
  const row = rows.find((r) => r.topicCode === topicCode && r.channelCode === channelCode);
  return row ? row.isEnabled : true;
}

function globalNotificationsEnabled(
  prefs: ChannelPreference[],
  channelCode: NotificationChannelCode,
): boolean {
  const row = prefs.find((p) => p.channelCode === channelCode);
  return row ? row.isEnabledForNotifications !== false : true;
}

/**
 * Единая бизнес-логика выбора каналов доставки для темы (telegram / max / web_push / email).
 */
export function resolvePatientNotificationChannels(params: {
  topicCode: string;
  availability: PatientNotificationChannelAvailability;
  channelPrefs: ChannelPreference[];
  topicChannelRows: TopicChannelPrefRow[];
  gate?: NotificationTopicGate;
}): ResolvedNotificationChannelsCore {
  const topicCode = params.topicCode.trim();
  const allowed = allowedChannelsForTopic(topicCode);
  const availableChannels: NotificationChannelCode[] = [];
  const enabledChannels: NotificationChannelCode[] = [];
  const selectedChannels: NotificationChannelCode[] = [];
  const skippedChannels: SkippedNotificationChannel[] = [];

  const gate = params.gate;
  if (gate?.muted) {
    for (const code of allowed) {
      skippedChannels.push({ channel: code, reason: "muted" });
    }
    return { selectedChannels, skippedChannels, availableChannels, enabledChannels };
  }

  const { availability: a, channelPrefs, topicChannelRows } = params;

  const consider = (code: NotificationChannelCode) => {
    if (!allowed.includes(code)) {
      skippedChannels.push({ channel: code, reason: "channel_not_allowed_for_topic" });
      return;
    }

    switch (code) {
      case "telegram":
        if (!a.hasTelegram) {
          skippedChannels.push({ channel: code, reason: "missing_binding" });
          return;
        }
        break;
      case "max":
        if (!a.hasMax) {
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
          skippedChannels.push({ channel: code, reason: "provider_disabled" });
          return;
        }
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
      skippedChannels.push({ channel: code, reason: "disabled_by_user_topic_channel" });
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
