import { describe, expect, it } from "vitest";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import {
  EXERCISE_REMINDERS_TOPIC,
  formatReminderDeliveryChannelsListRu,
  resolveActiveReminderDeliveryLabelsForTopic,
} from "./reminderDeliveryChannelLabels";

describe("formatReminderDeliveryChannelsListRu", () => {
  it("joins two channels with «и»", () => {
    expect(formatReminderDeliveryChannelsListRu(["Telegram", "Push"])).toBe("Telegram и Push");
  });
});

describe("resolveActiveReminderDeliveryLabelsForTopic", () => {
  it("returns telegram and push when bindings and subscription exist", async () => {
    const channelPreferences: ChannelPreferencesPort = {
      getPreferences: async () => [],
      upsertPreference: async () => ({
        channelCode: "telegram" as const,
        isEnabledForMessages: true,
        isEnabledForNotifications: true,
        isPreferredForAuth: false,
      }),
      getBroadcastNotificationFlagsBatch: async () => new Map(),
      getPreferredAuthChannelCode: async () => null,
      setPreferredAuthChannel: async () => {},
    };
    const topicChannelPrefs: TopicChannelPrefsPort = {
      listByUserId: async () => [],
      upsert: async () => {},
    };
    const labels = await resolveActiveReminderDeliveryLabelsForTopic({
      platformUserId: "u1",
      topicCode: EXERCISE_REMINDERS_TOPIC,
      bindings: { telegramId: "123" },
      channelPreferences,
      topicChannelPrefs,
      webPushSubscriptions: { hasAnyForUserId: async () => true },
    });
    expect(labels).toEqual(["Push", "Telegram"]);
  });

  it("omits push when subscription missing", async () => {
    const channelPreferences: ChannelPreferencesPort = {
      getPreferences: async () => [],
      upsertPreference: async () => ({
        channelCode: "telegram" as const,
        isEnabledForMessages: true,
        isEnabledForNotifications: true,
        isPreferredForAuth: false,
      }),
      getBroadcastNotificationFlagsBatch: async () => new Map(),
      getPreferredAuthChannelCode: async () => null,
      setPreferredAuthChannel: async () => {},
    };
    const topicChannelPrefs: TopicChannelPrefsPort = {
      listByUserId: async () => [],
      upsert: async () => {},
    };
    const labels = await resolveActiveReminderDeliveryLabelsForTopic({
      platformUserId: "u1",
      topicCode: EXERCISE_REMINDERS_TOPIC,
      bindings: { maxId: "max-1" },
      channelPreferences,
      topicChannelPrefs,
      webPushSubscriptions: { hasAnyForUserId: async () => false },
    });
    expect(labels).toEqual(["MAX"]);
  });
});
