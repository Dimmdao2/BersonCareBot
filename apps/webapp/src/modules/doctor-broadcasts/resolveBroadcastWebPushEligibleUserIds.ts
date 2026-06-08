import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { broadcastNotificationTopicCode } from "@/modules/patient-notifications/notificationTopicCodes";
import {
  resolvePatientNotificationChannels,
  type NotificationTopicGate,
} from "@/modules/patient-notifications/resolveNotificationChannels";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import type { BroadcastCategory } from "./ports";

export type ResolveBroadcastWebPushEligibleUserIdsDeps = {
  webPushSubscriptions: WebPushSubscriptionsPort;
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  readReminderNotifyGate: (platformUserId: string, topicCode: string) => Promise<NotificationTopicGate>;
};

export async function resolveBroadcastWebPushEligibleUserIds(
  clients: readonly ClientListItem[],
  broadcastCategory: BroadcastCategory,
  deps: ResolveBroadcastWebPushEligibleUserIdsDeps,
): Promise<Set<string>> {
  const eligible = new Set<string>();
  const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
  if (!vapidKeys) return eligible;

  const topicCode = broadcastNotificationTopicCode(broadcastCategory);

  for (const client of clients) {
    const uid = client.userId;
    if (!(await deps.webPushSubscriptions.hasAnyForUserId(uid))) continue;

    const gate = await deps.readReminderNotifyGate(uid, topicCode);
    if (gate.muted) continue;

    const prefs = await deps.channelPreferences.getPreferences(uid);
    const topicRows = await deps.topicChannelPrefs.listByUserId(uid);
    const subs = await deps.webPushSubscriptions.listActiveByUserId(uid);

    const resolved = resolvePatientNotificationChannels({
      topicCode,
      availability: {
        hasTelegram: false,
        hasMax: false,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: subs.length > 0,
        vapidConfigured: true,
        smtpConfigured: false,
      },
      channelPrefs: prefs,
      topicChannelRows: topicRows,
      gate,
    });

    if (resolved.selectedChannels.includes("web_push")) {
      eligible.add(uid);
    }
  }

  return eligible;
}
