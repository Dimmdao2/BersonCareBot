import { describe, expect, it, vi } from "vitest";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import { resolveDeliveryTargetsForTopic } from "./deliveryTargets";

describe("resolveDeliveryTargetsForTopic", () => {
  it("maps selected telegram/max to channelBindings from unified resolver", async () => {
    const result = await resolveDeliveryTargetsForTopic({
      userId: "u1",
      bindings: { telegramId: "tg-1", maxId: "max-1" },
      preferencesPort: {
        getPreferences: vi.fn().mockResolvedValue([
          { channelCode: "telegram", isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
          { channelCode: "max", isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
        ]),
        upsertPreference: vi.fn(),
        getBroadcastNotificationFlagsBatch: vi.fn().mockResolvedValue(new Map()),
        getPreferredAuthChannelCode: vi.fn().mockResolvedValue(null),
        setPreferredAuthChannel: vi.fn(),
      } satisfies ChannelPreferencesPort,
      topicCode: "exercise_reminders",
      topicChannelPrefsPort: {
        listByUserId: vi.fn().mockResolvedValue([
          { topicCode: "exercise_reminders", channelCode: "telegram", isEnabled: true },
          { topicCode: "exercise_reminders", channelCode: "max", isEnabled: false },
        ]),
        upsert: vi.fn(),
      } satisfies TopicChannelPrefsPort,
      gate: { muted: false, topicMasterEnabled: true },
      availability: {
        hasTelegram: true,
        hasMax: true,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: false,
        vapidConfigured: false,
        smtpConfigured: false,
      },
      integratorUserId: "42",
    });

    expect(result.channelBindings).toEqual({ telegramId: "tg-1" });
    expect(result.resolution?.selectedChannels).toEqual(["telegram"]);
    expect(result.resolution?.integratorUserId).toBe("42");
    expect(result.resolution?.skippedChannels.find((s) => s.channel === "max")?.reason).toBe(
      "disabled_by_user_topic_channel",
    );
  });
});
