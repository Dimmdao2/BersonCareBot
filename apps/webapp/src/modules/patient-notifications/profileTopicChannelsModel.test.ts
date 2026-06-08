import { describe, expect, it } from "vitest";
import {
  applyWebPushColumnAvailability,
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
      [{ id: "training_reminders", title: "Занятия" }],
      [{ topicCode: "training_reminders", channelCode: "web_push", isEnabled: true }],
      [],
      { ...availabilityBase, globalWebPushEnabled: false, hasWebPushSubscription: true },
    );
    expect(topics[0]?.channels.some((c) => c.code === "web_push")).toBe(false);
  });

  it("shows Push column when subscription and global pref are on", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "training_reminders", title: "Занятия" }],
      [{ topicCode: "training_reminders", channelCode: "web_push", isEnabled: false }],
      [],
      availabilityBase,
    );
    const push = topics[0]?.channels.find((c) => c.code === "web_push");
    expect(push).toBeDefined();
    expect(push?.isEnabled).toBe(false);
  });

  it("always exposes topicMasterEnabled true (master switch removed from UI)", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "patient_news", title: "Новости" }],
      [],
      [{ topicCode: "patient_news", isEnabled: false }],
      { ...availabilityBase, hasWebPushSubscription: false },
    );
    expect(topics[0]?.topicMasterEnabled).toBe(true);
  });
});

describe("applyWebPushColumnAvailability", () => {
  it("shows disabled push column when push is not effective", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "training_reminders", title: "Занятия" }],
      [{ topicCode: "training_reminders", channelCode: "web_push", isEnabled: true }],
      [],
      { ...availabilityBase, globalWebPushEnabled: false },
    );
    const patched = applyWebPushColumnAvailability(topics, false);
    const push = patched[0]?.channels.find((c) => c.code === "web_push");
    expect(push).toBeDefined();
    expect(push?.isEnabled).toBe(false);
    expect(push?.isEditable).toBe(false);
  });
});

describe("ensureWebPushInNotificationTopics", () => {
  it("adds Push column when subscription exists and global pref is on", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "training_reminders", title: "Занятия" }],
      [],
      [],
      { ...availabilityBase, globalWebPushEnabled: false },
    );
    const patched = ensureWebPushInNotificationTopics(topics, true, true);
    expect(patched[0]?.channels.some((c) => c.code === "web_push")).toBe(true);
  });

  it("does not add Push when global pref is off", () => {
    const topics = buildProfileNotificationTopicModels(
      [{ id: "training_reminders", title: "Занятия" }],
      [{ topicCode: "training_reminders", channelCode: "web_push", isEnabled: true }],
      [],
      { ...availabilityBase, globalWebPushEnabled: false },
    );
    expect(topics[0]?.channels.some((c) => c.code === "web_push")).toBe(false);
    const patched = ensureWebPushInNotificationTopics(topics, true, false);
    expect(patched[0]?.channels.some((c) => c.code === "web_push")).toBe(false);
  });
});
