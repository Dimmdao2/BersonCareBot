import type { TopicChannelPrefRow } from "@/modules/patient-notifications/topicChannelPrefsPort";
import {
  DOCTOR_NOTIFICATION_TOPIC_CODES,
  DOCTOR_NOTIFICATION_TOPIC_LABELS,
  type DoctorNotificationTopicCode,
} from "./doctorNotificationTopics";
import {
  allowedDoctorChannelsForTopic,
  type DoctorTopicChannelCode,
} from "./doctorTopicChannelRules";
import {
  defaultDoctorTopicFallbackChannels,
  isDoctorTopicChannelEnabled,
} from "./doctorTopicChannelDefaults";

const CHANNEL_LABEL: Record<DoctorTopicChannelCode, string> = {
  telegram: "Telegram",
  max: "MAX",
  email: "Email",
  web_push: "Push",
};

export type DoctorNotificationChannelModel = {
  code: DoctorTopicChannelCode;
  label: string;
  isEnabled: boolean;
  isEditable?: boolean;
};

export type DoctorNotificationTopicModel = {
  topicId: DoctorNotificationTopicCode;
  displayTitle: string;
  channels: DoctorNotificationChannelModel[];
};

export type DoctorNotificationAvailability = {
  hasTelegram: boolean;
  hasMax: boolean;
  emailVerified: boolean;
  hasWebPushSubscription: boolean;
  globalWebPushEnabled: boolean;
};

function globalFallbackForTopic(
  topicId: DoctorNotificationTopicCode,
  globalTaskReminderChannels: readonly string[],
): readonly string[] {
  if (topicId === "doctor_specialist_task_reminders") {
    return globalTaskReminderChannels;
  }
  return defaultDoctorTopicFallbackChannels(topicId);
}

function webPushColumnVisible(availability: DoctorNotificationAvailability): boolean {
  return availability.hasWebPushSubscription && availability.globalWebPushEnabled;
}

export function buildDoctorNotificationTopicModels(
  prefRows: TopicChannelPrefRow[],
  availability: DoctorNotificationAvailability,
  globalTaskReminderChannels: readonly string[],
): DoctorNotificationTopicModel[] {
  return DOCTOR_NOTIFICATION_TOPIC_CODES.map((topicId) => {
    const allowed = allowedDoctorChannelsForTopic(topicId);
    const globalFallback = globalFallbackForTopic(topicId, globalTaskReminderChannels);
    const channels: DoctorNotificationChannelModel[] = [];

    for (const code of allowed) {
      if (code === "telegram" && !availability.hasTelegram) continue;
      if (code === "max" && !availability.hasMax) continue;
      if (code === "email" && !availability.emailVerified) continue;
      if (code === "web_push") {
        channels.push({
          code,
          label: CHANNEL_LABEL[code],
          isEnabled: webPushColumnVisible(availability)
            ? isDoctorTopicChannelEnabled(prefRows, topicId, code, globalFallback)
            : false,
          isEditable: webPushColumnVisible(availability),
        });
        continue;
      }
      channels.push({
        code,
        label: CHANNEL_LABEL[code],
        isEnabled: isDoctorTopicChannelEnabled(prefRows, topicId, code, globalFallback),
        isEditable: true,
      });
    }

    return {
      topicId,
      displayTitle: DOCTOR_NOTIFICATION_TOPIC_LABELS[topicId],
      channels,
    };
  });
}
