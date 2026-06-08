import type { ChannelBindings } from "@/shared/types/session";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { PatientTopicChannelCode } from "@/modules/patient-notifications/topicChannelRules";
import { allowedChannelsForTopic } from "@/modules/patient-notifications/topicChannelRules";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";

import { NOTIFICATION_TOPIC_TRAINING } from "@/modules/patient-notifications/notificationTopicCodes";

/** Topic for exercise/LFK reminder delivery labels (warmup uses {@link NOTIFICATION_TOPIC_WARMUP}). */
export const EXERCISE_REMINDERS_TOPIC = NOTIFICATION_TOPIC_TRAINING;

const CHANNEL_LABEL_RU: Record<PatientTopicChannelCode, string> = {
  web_push: "Push",
  telegram: "Telegram",
  max: "MAX",
  email: "Email",
};

export function formatReminderDeliveryChannelsListRu(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} и ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

function topicChannelEnabled(
  rows: Awaited<ReturnType<TopicChannelPrefsPort["listByUserId"]>>,
  topicCode: string,
  channelCode: PatientTopicChannelCode,
): boolean {
  const row = rows.find((x) => x.topicCode === topicCode && x.channelCode === channelCode);
  return row ? row.isEnabled : true;
}

/** Активные каналы доставки для темы напоминаний (prefs + bindings + push subscription). */
export async function resolveActiveReminderDeliveryLabelsForTopic(input: {
  platformUserId: string;
  topicCode: string;
  bindings: ChannelBindings;
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: Pick<WebPushSubscriptionsPort, "hasAnyForUserId">;
  email?: { hasEmail: boolean; verified: boolean };
}): Promise<string[]> {
  const prefs = await input.channelPreferences.getPreferences(input.platformUserId);
  const byCode = new Map(prefs.map((p) => [p.channelCode, p]));
  const topicRows = await input.topicChannelPrefs.listByUserId(input.platformUserId);
  const allowed = new Set(
    allowedChannelsForTopic(input.topicCode) as readonly PatientTopicChannelCode[],
  );
  const ordered: PatientTopicChannelCode[] = [];
  const pushLike: PatientTopicChannelCode[] = ["web_push", "telegram", "max", "email"];
  for (const code of pushLike) {
    if (allowed.has(code)) ordered.push(code);
  }

  const active: string[] = [];
  for (const channelCode of ordered) {
    if (!topicChannelEnabled(topicRows, input.topicCode, channelCode)) continue;
    switch (channelCode) {
      case "web_push":
        if (byCode.get("web_push")?.isEnabledForNotifications === false) break;
        if (await input.webPushSubscriptions.hasAnyForUserId(input.platformUserId)) {
          active.push(CHANNEL_LABEL_RU.web_push);
        }
        break;
      case "telegram":
        if (byCode.get("telegram")?.isEnabledForNotifications === false) break;
        if (input.bindings.telegramId?.trim()) active.push(CHANNEL_LABEL_RU.telegram);
        break;
      case "max":
        if (byCode.get("max")?.isEnabledForNotifications === false) break;
        if (input.bindings.maxId?.trim()) active.push(CHANNEL_LABEL_RU.max);
        break;
      case "email":
        if (byCode.get("email")?.isEnabledForNotifications === false) break;
        if (input.email?.hasEmail && input.email.verified) {
          active.push(CHANNEL_LABEL_RU.email);
        }
        break;
      default:
        break;
    }
  }
  return active;
}
