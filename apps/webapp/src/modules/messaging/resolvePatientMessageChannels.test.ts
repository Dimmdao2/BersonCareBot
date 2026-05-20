import { describe, expect, it } from "vitest";
import { resolvePatientMessageChannels } from "./resolvePatientMessageChannels";

const allOn = [
  { channelCode: "telegram" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "max" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "email" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "web_push" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
];

describe("resolvePatientMessageChannels", () => {
  it("selects all linked channels when messages are enabled", () => {
    const r = resolvePatientMessageChannels({
      channelPrefs: allOn,
      availability: {
        hasTelegram: true,
        hasMax: true,
        hasEmail: true,
        emailVerified: true,
        hasWebPushSubscription: true,
        vapidConfigured: true,
        smtpConfigured: true,
      },
    });
    expect(r.selectedChannels).toEqual(["web_push", "telegram", "max", "email"]);
  });

  it("skips telegram when isEnabledForMessages is false", () => {
    const r = resolvePatientMessageChannels({
      channelPrefs: allOn.map((p) =>
        p.channelCode === "telegram" ? { ...p, isEnabledForMessages: false } : p,
      ),
      availability: {
        hasTelegram: true,
        hasMax: false,
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: false,
        vapidConfigured: false,
      },
    });
    expect(r.selectedChannels).not.toContain("telegram");
  });
});
