import { describe, expect, it } from "vitest";
import {
  buildProfileNotificationTopicModels,
  ensureWebPushInNotificationTopics,
} from "./profileTopicChannelsModel";

describe("ensureWebPushInNotificationTopics", () => {
  it("adds Push column when subscription exists but SSR topics omit web_push", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "exercise_reminders", title: "Занятия" }],
      [],
      { hasTelegram: false, hasMax: false, emailVerified: false, hasWebPush: false },
    );
    expect(topics[0]?.channels.some((c) => c.code === "web_push")).toBe(false);
    const patched = ensureWebPushInNotificationTopics(topics, true);
    expect(patched[0]?.channels.some((c) => c.code === "web_push")).toBe(true);
  });

  it("does not duplicate web_push when already present", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "exercise_reminders", title: "Занятия" }],
      [],
      { hasTelegram: false, hasMax: false, emailVerified: false, hasWebPush: true },
    );
    const patched = ensureWebPushInNotificationTopics(topics, true);
    expect(patched[0]?.channels.filter((c) => c.code === "web_push")).toHaveLength(1);
  });
});
