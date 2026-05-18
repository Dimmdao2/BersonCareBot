import { describe, expect, it } from "vitest";
import {
  buildProfileNotificationTopicModels,
  ensureWebPushInNotificationTopics,
} from "./profileTopicChannelsModel";

const availabilityBase = {
  hasTelegram: false,
  hasMax: false,
  emailVerified: false,
  hasWebPushSubscription: true,
  globalWebPushEnabled: true,
};

describe("buildProfileNotificationTopicModels", () => {
  it("hides Push column when global web_push pref is off but topic-channel rows stay in DB", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "exercise_reminders", title: "Занятия" }],
      [{ topicCode: "exercise_reminders", channelCode: "web_push", isEnabled: true }],
      [],
      { ...availabilityBase, globalWebPushEnabled: false, hasWebPushSubscription: true },
    );
    expect(topics[0]?.channels.some((c) => c.code === "web_push")).toBe(false);
  });

  it("shows Push column when subscription and global pref are on", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "exercise_reminders", title: "Занятия" }],
      [{ topicCode: "exercise_reminders", channelCode: "web_push", isEnabled: false }],
      [],
      availabilityBase,
    );
    const push = topics[0]?.channels.find((c) => c.code === "web_push");
    expect(push).toBeDefined();
    expect(push?.isEnabled).toBe(false);
  });

  it("sets topicMasterEnabled from user_notification_topics rows", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "news", title: "Новости" }],
      [],
      [{ topicCode: "news", isEnabled: false }],
      { ...availabilityBase, hasWebPushSubscription: false },
    );
    expect(topics[0]?.topicMasterEnabled).toBe(false);
  });

  it("defaults topicMasterEnabled to true when no master row", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "news", title: "Новости" }],
      [],
      [],
      { ...availabilityBase, hasWebPushSubscription: false },
    );
    expect(topics[0]?.topicMasterEnabled).toBe(true);
  });
});

describe("ensureWebPushInNotificationTopics", () => {
  it("adds Push column when subscription exists and global pref is on", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "exercise_reminders", title: "Занятия" }],
      [],
      [],
      { ...availabilityBase, globalWebPushEnabled: false },
    );
    const patched = ensureWebPushInNotificationTopics(topics, true, true);
    expect(patched[0]?.channels.some((c) => c.code === "web_push")).toBe(true);
  });

  it("does not add Push when global pref is off", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "exercise_reminders", title: "Занятия" }],
      [{ topicCode: "exercise_reminders", channelCode: "web_push", isEnabled: true }],
      [],
      { ...availabilityBase, globalWebPushEnabled: false },
    );
    expect(topics[0]?.channels.some((c) => c.code === "web_push")).toBe(false);
    const patched = ensureWebPushInNotificationTopics(topics, true, false);
    expect(patched[0]?.channels.some((c) => c.code === "web_push")).toBe(false);
  });
});
