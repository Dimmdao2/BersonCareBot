import { describe, expect, it } from "vitest";
import { resolvePatientNotificationChannels } from "./resolveNotificationChannels";

const basePrefs = [
  { channelCode: "telegram" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "web_push" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
];

describe("topic-channel prefs", () => {
  it("all channels off for topic yields empty delivery", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "training_reminders",
      availability: {
        hasTelegram: true,
        hasMax: false,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: true,
        vapidConfigured: true,
      },
      channelPrefs: basePrefs,
      topicChannelRows: [
        { topicCode: "training_reminders", channelCode: "telegram", isEnabled: false },
        { topicCode: "training_reminders", channelCode: "web_push", isEnabled: false },
      ],
    });
    expect(r.selectedChannels).toEqual([]);
    expect(r.skippedChannels.length).toBeGreaterThan(0);
  });

  it("enabled per-channel rows deliver without master switch", () => {
    const rows = [{ topicCode: "training_reminders", channelCode: "telegram" as const, isEnabled: true }];
    const enabled = resolvePatientNotificationChannels({
      topicCode: "training_reminders",
      availability: {
        hasTelegram: true,
        hasMax: false,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: false,
        vapidConfigured: false,
      },
      channelPrefs: basePrefs,
      topicChannelRows: rows,
    });
    expect(enabled.selectedChannels).toContain("telegram");
  });
});
