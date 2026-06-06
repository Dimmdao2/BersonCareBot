import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import { parseSpecialistTaskReminderChannels } from "@/modules/specialist-tasks/reminderChannels";
import type { SpecialistTaskReminderChannelCode } from "@/modules/specialist-tasks/types";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { resolveDoctorNotificationChannels } from "./resolveDoctorNotificationChannels";

export type ResolveSpecialistTaskReminderChannelsDeps = {
  topicChannelPrefs: TopicChannelPrefsPort;
  channelPreferences: ChannelPreferencesPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  getChannelBindings: (
    platformUserId: string,
  ) => Promise<{ telegramId?: string | null; maxId?: string | null }>;
  getProfileEmail: (platformUserId: string) => Promise<string | null>;
  getProfileEmailVerified: (platformUserId: string) => Promise<boolean>;
};

const TOPIC_CODE = "doctor_specialist_task_reminders";

export async function resolveSpecialistTaskReminderChannelsForUser(
  ownerUserId: string,
  deps: ResolveSpecialistTaskReminderChannelsDeps,
): Promise<SpecialistTaskReminderChannelCode[]> {
  const [prefRows, channelPrefs, globalSetting, vapid, bindings, email, emailVerified, hasPush] =
    await Promise.all([
      deps.topicChannelPrefs.listByUserId(ownerUserId),
      deps.channelPreferences.getPreferences(ownerUserId),
      deps.systemSettings.getSetting("doctor_specialist_task_reminder_channels", "doctor"),
      getWebPushVapidKeyPair(deps.systemSettings),
      deps.getChannelBindings(ownerUserId),
      deps.getProfileEmail(ownerUserId),
      deps.getProfileEmailVerified(ownerUserId),
      deps.webPushSubscriptions.hasAnyForUserId(ownerUserId),
    ]);

  const globalFallback = parseSpecialistTaskReminderChannels(globalSetting?.valueJson ?? null);

  return resolveDoctorNotificationChannels({
    topicCode: TOPIC_CODE,
    availability: {
      hasTelegram: Boolean(bindings.telegramId?.trim()),
      hasMax: Boolean(bindings.maxId?.trim()),
      hasEmail: Boolean(email?.trim()),
      emailVerified,
      hasWebPushSubscription: hasPush,
      vapidConfigured: Boolean(vapid),
    },
    channelPrefs,
    topicChannelRows: prefRows,
    globalFallbackChannels: globalFallback,
  });
}
