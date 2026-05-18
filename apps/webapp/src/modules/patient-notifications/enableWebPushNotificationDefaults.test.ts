import { describe, expect, it, vi } from "vitest";
import { enableWebPushNotificationDefaults } from "./enableWebPushNotificationDefaults";
import type { TopicChannelPrefsPort } from "./topicChannelPrefsPort";

describe("enableWebPushNotificationDefaults", () => {
  it("upserts web_push for topics that allow push", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const port: TopicChannelPrefsPort = { listByUserId: async () => [], upsert };
    const { enabledTopics } = await enableWebPushNotificationDefaults({
      userId: "u1",
      topicChannelPrefs: port,
      notificationTopics: [
        { id: "exercise_reminders" },
        { id: "news" },
        { id: "unknown_custom" },
      ],
    });
    expect(enabledTopics).toContain("exercise_reminders");
    expect(enabledTopics).toContain("news");
    expect(upsert).toHaveBeenCalledWith("u1", "exercise_reminders", "web_push", true);
    expect(upsert).toHaveBeenCalledWith("u1", "news", "web_push", true);
  });
});
