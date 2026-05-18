import { describe, expect, it } from "vitest";
import { resolvePatientNotificationChannels } from "./resolveNotificationChannels";

const basePrefs = [
  { channelCode: "telegram" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "web_push" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
];

describe("topic master vs topic-channel prefs", () => {
  it("topic_disabled blocks delivery but topic-channel rows can remain enabled in prefs", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
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
        { topicCode: "exercise_reminders", channelCode: "telegram", isEnabled: true },
        { topicCode: "exercise_reminders", channelCode: "web_push", isEnabled: true },
      ],
      gate: { muted: false, topicMasterEnabled: false },
    });
    expect(r.selectedChannels).toEqual([]);
    expect(r.skippedChannels.every((s) => s.reason === "topic_disabled")).toBe(true);
  });

  it("re-enabling topic master does not require changing topic-channel rows", () => {
    const rows = [{ topicCode: "exercise_reminders", channelCode: "telegram" as const, isEnabled: true }];
    const enabled = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
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
      gate: { muted: false, topicMasterEnabled: true },
    });
    expect(enabled.selectedChannels).toContain("telegram");
  });
});
