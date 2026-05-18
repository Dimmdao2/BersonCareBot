import { describe, expect, it } from "vitest";
import { resolvePatientNotificationChannels } from "./resolveNotificationChannels";

const basePrefs = [
  { channelCode: "telegram" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "max" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "email" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "web_push" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
];

describe("resolvePatientNotificationChannels", () => {
  it("selects push and telegram when enabled and available", () => {
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
      topicChannelRows: [],
    });
    expect(r.selectedChannels).toEqual(["web_push", "telegram"]);
    expect(r.skippedChannels.find((s) => s.channel === "max")?.reason).toBe("missing_binding");
  });

  it("skips push when disabled for topic", () => {
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
      topicChannelRows: [{ topicCode: "exercise_reminders", channelCode: "web_push", isEnabled: false }],
    });
    expect(r.selectedChannels).toEqual(["telegram"]);
    expect(r.skippedChannels.find((s) => s.channel === "web_push")?.reason).toBe("disabled_by_user_topic");
  });

  it("returns muted skip for all allowed channels", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: {
        hasTelegram: true,
        hasMax: true,
        hasEmail: true,
        emailVerified: true,
        hasWebPushSubscription: true,
        vapidConfigured: true,
      },
      channelPrefs: basePrefs,
      topicChannelRows: [],
      gate: { muted: true, topicMasterEnabled: true },
    });
    expect(r.selectedChannels).toEqual([]);
    expect(r.skippedChannels.length).toBeGreaterThan(0);
    expect(r.skippedChannels.every((s) => s.reason === "muted")).toBe(true);
  });
});
