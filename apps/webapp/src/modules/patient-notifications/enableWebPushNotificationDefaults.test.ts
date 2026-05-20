import { describe, expect, it, vi } from "vitest";
import { enableWebPushNotificationDefaults } from "./enableWebPushNotificationDefaults";
import type { TopicChannelPrefsPort } from "./topicChannelPrefsPort";

describe("enableWebPushNotificationDefaults", () => {
  it("upserts web_push only for topics without existing row", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const port: TopicChannelPrefsPort = {
      listByUserId: async () => [
        { topicCode: "exercise_reminders", channelCode: "web_push", isEnabled: false },
      ],
      upsert,
    };
    const { enabledTopics } = await enableWebPushNotificationDefaults({
      userId: "u1",
      topicChannelPrefs: port,
      notificationTopics: [{ id: "exercise_reminders" }, { id: "news" }, { id: "appointment_reminders" }],
    });
    expect(enabledTopics).toEqual(expect.arrayContaining(["news", "appointment_reminders"]));
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith("u1", "news", "web_push", true);
    expect(upsert).toHaveBeenCalledWith("u1", "appointment_reminders", "web_push", true);
  });
});
