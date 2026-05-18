import { allowedChannelsForTopic } from "./topicChannelRules";
import type { TopicChannelPrefsPort } from "./topicChannelPrefsPort";

/**
 * После успешной регистрации push-подписки включает web_push глобально и для всех тем,
 * где канал push допустим по allowlist.
 */
export async function enableWebPushNotificationDefaults(params: {
  userId: string;
  topicChannelPrefs: TopicChannelPrefsPort;
  notificationTopics: Array<{ id: string }>;
}): Promise<{ enabledTopics: string[] }> {
  const enabledTopics: string[] = [];
  for (const topic of params.notificationTopics) {
    const topicId = topic.id.trim();
    if (!topicId) continue;
    if (!allowedChannelsForTopic(topicId).includes("web_push")) continue;
    await params.topicChannelPrefs.upsert(params.userId, topicId, "web_push", true);
    enabledTopics.push(topicId);
  }
  return { enabledTopics };
}
