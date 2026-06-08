import { describe, expect, it } from "vitest";
import { resolveDoctorNotificationChannels } from "./resolveDoctorNotificationChannels";

describe("resolveDoctorNotificationChannels", () => {
  it("uses global fallback when user has no topic prefs", () => {
    const channels = resolveDoctorNotificationChannels({
      topicCode: "doctor_specialist_task_reminders",
      availability: {
        hasTelegram: true,
        hasMax: false,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: true,
        vapidConfigured: true,
      },
      channelPrefs: [],
      topicChannelRows: [],
      globalFallbackChannels: ["telegram", "web_push"],
    });
    expect(channels).toEqual(["telegram", "web_push"]);
  });

  it("respects per-user topic channel prefs", () => {
    const channels = resolveDoctorNotificationChannels({
      topicCode: "doctor_specialist_task_reminders",
      availability: {
        hasTelegram: true,
        hasMax: true,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: false,
        vapidConfigured: true,
      },
      channelPrefs: [],
      topicChannelRows: [
        {
          topicCode: "doctor_specialist_task_reminders",
          channelCode: "telegram",
          isEnabled: false,
        },
        {
          topicCode: "doctor_specialist_task_reminders",
          channelCode: "max",
          isEnabled: true,
        },
      ],
      globalFallbackChannels: ["telegram"],
    });
    expect(channels).toEqual(["max"]);
  });

  it("does not enable email after partial toggle without global fallback", () => {
    const channels = resolveDoctorNotificationChannels({
      topicCode: "doctor_specialist_task_reminders",
      availability: {
        hasTelegram: true,
        hasMax: true,
        hasEmail: true,
        emailVerified: true,
        hasWebPushSubscription: true,
        vapidConfigured: true,
      },
      channelPrefs: [],
      topicChannelRows: [
        {
          topicCode: "doctor_specialist_task_reminders",
          channelCode: "web_push",
          isEnabled: true,
        },
      ],
      globalFallbackChannels: ["telegram", "max"],
    });
    expect(channels).toEqual(["telegram", "max", "web_push"]);
    expect(channels).not.toContain("email");
  });

  it("enables web_push for patient messages when subscription exists and no prefs", () => {
    const channels = resolveDoctorNotificationChannels({
      topicCode: "doctor_patient_messages",
      availability: {
        hasTelegram: true,
        hasMax: false,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: true,
        vapidConfigured: true,
      },
      channelPrefs: [],
      topicChannelRows: [],
      globalFallbackChannels: ["web_push", "telegram", "max"],
    });
    expect(channels).toEqual(["web_push", "telegram"]);
  });

  it("skips web_push when subscription missing", () => {
    const channels = resolveDoctorNotificationChannels({
      topicCode: "doctor_patient_messages",
      availability: {
        hasTelegram: false,
        hasMax: false,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: false,
        vapidConfigured: true,
      },
      channelPrefs: [],
      topicChannelRows: [],
      globalFallbackChannels: ["web_push"],
    });
    expect(channels).toEqual([]);
  });
});
