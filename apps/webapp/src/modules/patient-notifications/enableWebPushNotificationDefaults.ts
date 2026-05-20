import { allowedChannelsForTopic } from "./topicChannelRules";
import type { TopicChannelPrefsPort } from "./topicChannelPrefsPort";

/**
 * После успешной регистрации push-подписки включает web_push для тем без сохранённой настройки.
 * Существующие topic-level prefs не перезаписываются (повторное включение в приложении).
 */
export async function enableWebPushNotificationDefaults(params: {
  userId: string;
  topicChannelPrefs: TopicChannelPrefsPort;
  notificationTopics: Array<{ id: string }>;
}): Promise<{ enabledTopics: string[] }> {
  const existing = await params.topicChannelPrefs.listByUserId(params.userId);
  const enabledTopics: string[] = [];

  for (const topic of params.notificationTopics) {
    const topicId = topic.id.trim();
    if (!topicId) continue;
    if (!allowedChannelsForTopic(topicId).includes("web_push")) continue;

    const hasRow = existing.some((r) => r.topicCode === topicId && r.channelCode === "web_push");
    if (hasRow) continue;

    await params.topicChannelPrefs.upsert(params.userId, topicId, "web_push", true);
    enabledTopics.push(topicId);
  }

  return { enabledTopics };
}
