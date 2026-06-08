import type { NotificationTopicMasterRow } from "./patientNotificationTopicsPort";
import type { TopicChannelPrefRow } from "./topicChannelPrefsPort";
import {
  allowedChannelsForTopic,
  type PatientTopicChannelCode,
} from "./topicChannelRules";
import { patientNotificationTopicDisplayTitle } from "./topicDisplayTitles";

const CHANNEL_LABEL: Record<PatientTopicChannelCode, string> = {
  telegram: "Telegram",
  max: "MAX",
  email: "Email",
  web_push: "Push",
};

export type ProfileNotificationChannelModel = {
  code: PatientTopicChannelCode;
  label: string;
  isEnabled: boolean;
  /** false — свитч недоступен (push выключен на устройстве/в приложении). */
  isEditable?: boolean;
};

export type ProfileNotificationTopicModel = {
  topicId: string;
  displayTitle: string;
  /** Master switch: `user_notification_topics`; нет строки → включено. */
  topicMasterEnabled: boolean;
  channels: ProfileNotificationChannelModel[];
};

export type ProfileNotificationAvailability = {
  hasTelegram: boolean;
  hasMax: boolean;
  emailVerified: boolean;
  /** Активная browser subscription. */
  hasWebPushSubscription: boolean;
  /** Глобальный pref `user_channel_preferences.web_push`. */
  globalWebPushEnabled: boolean;
};

function resolveTopicChannelEnabled(
  rows: TopicChannelPrefRow[],
  topicCode: string,
  channelCode: PatientTopicChannelCode,
): boolean {
  const row = rows.find((r) => r.topicCode === topicCode && r.channelCode === channelCode);
  return row ? row.isEnabled : true;
}

function resolveTopicMasterEnabled(rows: NotificationTopicMasterRow[], topicCode: string): boolean {
  const row = rows.find((r) => r.topicCode === topicCode);
  return row ? row.isEnabled : true;
}

function webPushColumnVisible(availability: ProfileNotificationAvailability): boolean {
  return availability.hasWebPushSubscription && availability.globalWebPushEnabled;
}

export function buildProfileNotificationTopicModels(
  topics: Array<{ id: string; title: string }>,
  prefRows: TopicChannelPrefRow[],
  topicMasterRows: NotificationTopicMasterRow[],
  availability: ProfileNotificationAvailability,
): ProfileNotificationTopicModel[] {
  return topics.map((t) => {
    const allowed = allowedChannelsForTopic(t.id);
    const channels: ProfileNotificationChannelModel[] = [];
    for (const code of allowed) {
      if (code === "telegram" && !availability.hasTelegram) continue;
      if (code === "max" && !availability.hasMax) continue;
      if (code === "email" && !availability.emailVerified) continue;
      if (code === "web_push" && !webPushColumnVisible(availability)) continue;
      channels.push({
        code,
        label: CHANNEL_LABEL[code],
        isEnabled: resolveTopicChannelEnabled(prefRows, t.id, code),
        isEditable: true,
      });
    }
    return {
      topicId: t.id,
      displayTitle: patientNotificationTopicDisplayTitle(t.id, t.title),
      topicMasterEnabled: true,
      channels,
    };
  });
}

/**
 * Показывает колонку Push для всех тем allowlist: при неактивном push — выключено и disabled.
 */
export function applyWebPushColumnAvailability(
  topics: ProfileNotificationTopicModel[],
  pushEffective: boolean,
): ProfileNotificationTopicModel[] {
  return topics.map((t) => {
    if (!allowedChannelsForTopic(t.topicId).includes("web_push")) return t;
    const existing = t.channels.find((c) => c.code === "web_push");
    if (pushEffective) {
      if (existing) return t;
      return {
        ...t,
        channels: [
          ...t.channels,
          { code: "web_push", label: CHANNEL_LABEL.web_push, isEnabled: true, isEditable: true },
        ],
      };
    }
    if (existing) {
      return {
        ...t,
        channels: t.channels.map((c) =>
          c.code === "web_push" ? { ...c, isEnabled: false, isEditable: false } : c,
        ),
      };
    }
    return {
      ...t,
      channels: [
        ...t.channels,
        { code: "web_push", label: CHANNEL_LABEL.web_push, isEnabled: false, isEditable: false },
      ],
    };
  });
}

/** Client-side: после subscribe до router.refresh() SSR topics могут быть без колонки Push. */
export function ensureWebPushInNotificationTopics(
  topics: ProfileNotificationTopicModel[],
  hasWebPushSubscription: boolean,
  globalWebPushEnabled: boolean,
): ProfileNotificationTopicModel[] {
  if (!hasWebPushSubscription || !globalWebPushEnabled) return topics;
  return topics.map((t) => {
    if (!allowedChannelsForTopic(t.topicId).includes("web_push")) return t;
    if (t.channels.some((c) => c.code === "web_push")) return t;
    return {
      ...t,
      channels: [
        ...t.channels,
        { code: "web_push", label: CHANNEL_LABEL.web_push, isEnabled: true },
      ],
    };
  });
}
