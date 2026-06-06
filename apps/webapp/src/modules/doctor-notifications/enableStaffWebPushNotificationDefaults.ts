import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import { DOCTOR_NOTIFICATION_TOPIC_CODES } from "./doctorNotificationTopics";
import { allowedDoctorChannelsForTopic } from "./doctorTopicChannelRules";

/** After first staff push subscribe: enable web_push for doctor topics that allow it (if no row yet). */
export async function enableStaffWebPushNotificationDefaults(params: {
  userId: string;
  topicChannelPrefs: TopicChannelPrefsPort;
}): Promise<string[]> {
  const existing = await params.topicChannelPrefs.listByUserId(params.userId);
  const enabledTopics: string[] = [];

  for (const topicCode of DOCTOR_NOTIFICATION_TOPIC_CODES) {
    if (!allowedDoctorChannelsForTopic(topicCode).includes("web_push")) continue;
    const hasRow = existing.some(
      (r) => r.topicCode === topicCode && r.channelCode === "web_push",
    );
    if (hasRow) continue;
    await params.topicChannelPrefs.upsert(params.userId, topicCode, "web_push", true);
    enabledTopics.push(topicCode);
  }

  return enabledTopics;
}
