import { describe, expect, it } from "vitest";
import { resolvePatientNotificationChannels } from "./resolveNotificationChannels";

const basePrefs = [
  { channelCode: "telegram" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "max" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "email" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "web_push" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
];

const allAvailable = {
  hasTelegram: true,
  hasMax: true,
  hasEmail: true,
  emailVerified: true,
  hasWebPushSubscription: true,
  vapidConfigured: true,
  smtpConfigured: true,
};

describe("resolvePatientNotificationChannels", () => {
  it("selects telegram when enabled and binding exists", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "appointment_reminders",
      availability: { ...allAvailable, hasMax: false, hasEmail: false, emailVerified: false, hasWebPushSubscription: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.selectedChannels).toContain("telegram");
    expect(r.skippedChannels.find((s) => s.channel === "telegram")).toBeUndefined();
  });

  it("skips telegram with missing_binding when no binding", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "appointment_reminders",
      availability: { ...allAvailable, hasTelegram: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.selectedChannels).not.toContain("telegram");
    expect(r.skippedChannels.find((s) => s.channel === "telegram")?.reason).toBe("missing_binding");
  });

  it("selects max when enabled and binding exists", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "appointment_reminders",
      availability: { ...allAvailable, hasTelegram: false, hasEmail: false, emailVerified: false, hasWebPushSubscription: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.selectedChannels).toContain("max");
  });

  it("skips max with missing_binding when no binding", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "appointment_reminders",
      availability: { ...allAvailable, hasMax: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.skippedChannels.find((s) => s.channel === "max")?.reason).toBe("missing_binding");
  });

  it("selects web_push when subscription and VAPID exist", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: { ...allAvailable, hasTelegram: false, hasMax: false, hasEmail: false, emailVerified: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.selectedChannels).toContain("web_push");
  });

  it("skips web_push with no_active_subscriptions", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: { ...allAvailable, hasWebPushSubscription: false, hasTelegram: false, hasMax: false, hasEmail: false, emailVerified: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.skippedChannels.find((s) => s.channel === "web_push")?.reason).toBe("no_active_subscriptions");
  });

  it("skips web_push with vapid_missing", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: { ...allAvailable, vapidConfigured: false, hasTelegram: false, hasMax: false, hasEmail: false, emailVerified: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.skippedChannels.find((s) => s.channel === "web_push")?.reason).toBe("vapid_missing");
  });

  it("selects email when verified and SMTP configured", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "appointment_reminders",
      availability: { ...allAvailable, hasTelegram: false, hasMax: false, hasWebPushSubscription: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.selectedChannels).toContain("email");
  });

  it("skips email with missing_email", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "appointment_reminders",
      availability: { ...allAvailable, hasEmail: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.skippedChannels.find((s) => s.channel === "email")?.reason).toBe("missing_email");
  });

  it("skips email with email_not_verified", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "appointment_reminders",
      availability: { ...allAvailable, emailVerified: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.skippedChannels.find((s) => s.channel === "email")?.reason).toBe("email_not_verified");
  });

  it("skips email with provider_disabled when SMTP missing", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "appointment_reminders",
      availability: { ...allAvailable, smtpConfigured: false },
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.skippedChannels.find((s) => s.channel === "email")?.reason).toBe("provider_disabled");
  });

  it("skips all allowed channels when topic disabled", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: allAvailable,
      channelPrefs: basePrefs,
      topicChannelRows: [],
      gate: { muted: false, topicMasterEnabled: false },
    });
    expect(r.selectedChannels).toEqual([]);
    expect(r.skippedChannels.every((s) => s.reason === "topic_disabled")).toBe(true);
  });

  it("skips with disabled_by_user_global", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: { ...allAvailable, hasMax: false, hasEmail: false, emailVerified: false },
      channelPrefs: basePrefs.map((p) =>
        p.channelCode === "telegram" ? { ...p, isEnabledForNotifications: false } : p,
      ),
      topicChannelRows: [],
    });
    expect(r.selectedChannels).not.toContain("telegram");
    expect(r.skippedChannels.find((s) => s.channel === "telegram")?.reason).toBe("disabled_by_user_global");
  });

  it("skips with disabled_by_user_topic_channel", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: { ...allAvailable, hasMax: false, hasEmail: false, emailVerified: false },
      channelPrefs: basePrefs,
      topicChannelRows: [{ topicCode: "exercise_reminders", channelCode: "web_push", isEnabled: false }],
    });
    expect(r.skippedChannels.find((s) => s.channel === "web_push")?.reason).toBe("disabled_by_user_topic_channel");
  });

  it("skips email on exercise_reminders with channel_not_allowed_for_topic", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: allAvailable,
      channelPrefs: basePrefs,
      topicChannelRows: [],
    });
    expect(r.skippedChannels.find((s) => s.channel === "email")?.reason).toBe("channel_not_allowed_for_topic");
  });

  it("skips all allowed channels when muted", () => {
    const r = resolvePatientNotificationChannels({
      topicCode: "exercise_reminders",
      availability: allAvailable,
      channelPrefs: basePrefs,
      topicChannelRows: [],
      gate: { muted: true, topicMasterEnabled: true },
    });
    expect(r.selectedChannels).toEqual([]);
    expect(r.skippedChannels.every((s) => s.reason === "muted")).toBe(true);
  });
});
