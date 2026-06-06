import type { ChannelPreference } from "@/modules/channel-preferences/types";
import type { SpecialistTaskReminderChannelCode } from "@/modules/specialist-tasks/types";
import type { TopicChannelPrefRow } from "@/modules/patient-notifications/topicChannelPrefsPort";
import {
  allowedDoctorChannelsForTopic,
  toSpecialistTaskReminderChannels,
  type DoctorTopicChannelCode,
} from "./doctorTopicChannelRules";
import { resolveConfiguredDoctorTopicChannels } from "./doctorTopicChannelDefaults";

export type DoctorNotificationChannelAvailability = {
  hasTelegram: boolean;
  hasMax: boolean;
  hasEmail: boolean;
  emailVerified: boolean;
  hasWebPushSubscription: boolean;
  vapidConfigured: boolean;
  smtpConfigured?: boolean;
};

function globalNotificationsEnabled(
  prefs: ChannelPreference[],
  channelCode: DoctorTopicChannelCode,
): boolean {
  const row = prefs.find((p) => p.channelCode === channelCode);
  return row ? row.isEnabledForNotifications !== false : true;
}

export function resolveDoctorNotificationChannels(params: {
  topicCode: string;
  availability: DoctorNotificationChannelAvailability;
  channelPrefs: ChannelPreference[];
  topicChannelRows: TopicChannelPrefRow[];
  globalFallbackChannels?: readonly SpecialistTaskReminderChannelCode[] | null;
}): SpecialistTaskReminderChannelCode[] {
  const topicCode = params.topicCode.trim();
  const configured = resolveConfiguredDoctorTopicChannels(
    topicCode,
    params.topicChannelRows,
    params.globalFallbackChannels ?? null,
  );
  const { availability: a, channelPrefs } = params;
  const selected: SpecialistTaskReminderChannelCode[] = [];

  for (const code of configured) {
    switch (code) {
      case "telegram":
        if (!a.hasTelegram) continue;
        break;
      case "max":
        if (!a.hasMax) continue;
        break;
      case "email":
        if (!a.hasEmail || !a.emailVerified) continue;
        if (a.smtpConfigured === false) continue;
        break;
      case "web_push":
        if (!a.vapidConfigured || !a.hasWebPushSubscription) continue;
        break;
      default:
        continue;
    }
    if (!globalNotificationsEnabled(channelPrefs, code)) continue;
    selected.push(code);
  }

  return toSpecialistTaskReminderChannels(selected);
}

/** @internal for tests */
export { resolveConfiguredDoctorTopicChannels, isDoctorTopicChannelEnabled } from "./doctorTopicChannelDefaults";
