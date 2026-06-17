import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { ChannelPreference } from "@/modules/channel-preferences/types";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import type { WebPushSubscriptionPayloadV1 } from "@/modules/web-push/ports";
import {
  runPatientReminderIntegratorNotify,
  type IntegratorPatientReminderNotifyBody,
  type PatientReminderIntegratorNotifyDeps,
} from "./integratorNotifyChannels";

const sendWebPushMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/web-push/sendWebPushToSubscriptions", () => ({
  sendWebPushToSubscriptions: sendWebPushMock,
}));

// S10: email send now goes through relayOutbound; smtpInnerFromValueJson moved to smtpOutboundPatch.
const relayOutboundMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

const smtpInnerFromValueJsonMock = vi.hoisted(() =>
  vi.fn(() => ({ success: true as const, data: { from: "noreply@example.com" } })),
);
vi.mock("@/modules/system-settings/smtpOutboundPatch", () => ({
  smtpInnerFromValueJson: smtpInnerFromValueJsonMock,
}));

const getWebPushVapidKeyPairMock = vi.hoisted(() =>
  vi.fn(async () => ({ publicKey: "pub", privateKey: "priv" })),
);
vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: getWebPushVapidKeyPairMock,
}));

const baseBody: IntegratorPatientReminderNotifyBody = {
  integratorUserId: "42",
  occurrenceId: "occ-1",
  topicCode: "appointment_reminders",
  title: "Напоминание",
  bodyText: "Текст",
  openUrl: "https://example.com/open",
};

const allChannelPrefs: ChannelPreference[] = [
  { channelCode: "telegram", isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "max", isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "email", isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "web_push", isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
];

const activeSub: WebPushSubscriptionPayloadV1 = {
  endpoint: "https://push.example/ep",
  expirationTime: null,
  keys: { p256dh: "p", auth: "a" },
};

const channelPreferencesPort: ChannelPreferencesPort = {
  getPreferences: async () => allChannelPrefs,
  upsertPreference: async () => allChannelPrefs[0]!,
  getBroadcastNotificationFlagsBatch: async () => new Map(),
  getPreferredAuthChannelCode: async () => null,
  setPreferredAuthChannel: async () => {},
};

const topicChannelPrefsPort: TopicChannelPrefsPort = {
  listByUserId: async () => [],
  upsert: async () => {},
};

const webPushSubscriptionsPort = {
  saveSubscription: async () => {},
  removeSubscriptionByEndpoint: async () => {},
  removeSubscriptionsForUser: async () => {},
  hasAnyForUserId: async () => true,
  listActiveByUserId: async () => [activeSub],
  deleteByEndpointIfExists: async () => false,
} satisfies WebPushSubscriptionsPort;

function buildDeps(overrides: Partial<PatientReminderIntegratorNotifyDeps> = {}): PatientReminderIntegratorNotifyDeps {
  return {
    findPlatformUserByIntegratorId: async () => ({ platformUserId: "platform-uid" }),
    channelPreferences: channelPreferencesPort,
    topicChannelPrefs: topicChannelPrefsPort,
    webPushSubscriptions: webPushSubscriptionsPort,
    systemSettings: {
      getSetting: async (key) => {
        if (key === "smtp_outbound") return { valueJson: { value: { host: "smtp" } } } as never;
        return null;
      },
    },
    getProfileEmailFields: async () => ({
      email: "user@example.com",
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    }),
    readReminderNotifyGate: async () => ({ muted: false, topicMasterEnabled: true }),
    getChannelBindings: async () => ({}),
    ...overrides,
  };
}

describe("runPatientReminderIntegratorNotify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendWebPushMock.mockResolvedValue({ delivered: 1, errors: 0, deactivated: 0 });
    // S10: relayOutbound used for email now
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
    getWebPushVapidKeyPairMock.mockResolvedValue({ publicKey: "pub", privateKey: "priv" });
    smtpInnerFromValueJsonMock.mockReturnValue({
      success: true,
      data: { from: "noreply@example.com" },
    });
  });

  it("returns no_platform_user when platform mapping is missing", async () => {
    const result = await runPatientReminderIntegratorNotify(baseBody, buildDeps({
      findPlatformUserByIntegratorId: async () => null,
    }));
    expect(result).toMatchObject({ ok: true, skipped: "no_platform_user", skippedChannels: [] });
    expect(sendWebPushMock).not.toHaveBeenCalled();
  });

  it("returns muted with resolved skippedChannels", async () => {
    const result = await runPatientReminderIntegratorNotify(baseBody, buildDeps({
      readReminderNotifyGate: async () => ({ muted: true, topicMasterEnabled: true }),
    }));
    expect(result).toMatchObject({ ok: true, skipped: "muted" });
    const skipped = result.skippedChannels as Array<{ reason: string }>;
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.every((s) => s.reason === "muted")).toBe(true);
    expect(sendWebPushMock).not.toHaveBeenCalled();
  });

  it("returns skipped when all topic channels disabled", async () => {
    const result = await runPatientReminderIntegratorNotify(
      { ...baseBody, topicCode: "training_reminders" },
      buildDeps({
      topicChannelPrefs: {
        listByUserId: async () => [
          { topicCode: "training_reminders", channelCode: "telegram", isEnabled: false },
          { topicCode: "training_reminders", channelCode: "web_push", isEnabled: false },
        ],
        upsert: async () => {},
      },
    }));
    expect(result.selectedChannels).toEqual([]);
    const skipped = result.skippedChannels as Array<{ reason: string }>;
    expect(skipped.some((s) => s.reason === "disabled_by_user_topic_channel")).toBe(true);
    expect(sendWebPushMock).not.toHaveBeenCalled();
  });

  it("skips web_push when there are no active subscriptions", async () => {
    const result = await runPatientReminderIntegratorNotify(
      { ...baseBody, topicCode: "training_reminders" },
      buildDeps({
        webPushSubscriptions: {
          ...webPushSubscriptionsPort,
          listActiveByUserId: async () => [],
          hasAnyForUserId: async () => false,
        },
        getChannelBindings: async () => ({ telegramId: "tg-1" }),
      }),
    );
    expect(result.selectedChannels).toEqual(["telegram"]);
    const skipped = result.skippedChannels as Array<{ channel: string; reason: string }>;
    expect(skipped.find((s) => s.channel === "web_push")?.reason).toBe("no_active_subscriptions");
    expect(sendWebPushMock).not.toHaveBeenCalled();
  });

  it("delivers web_push when selected", async () => {
    const result = await runPatientReminderIntegratorNotify(
      { ...baseBody, topicCode: "training_reminders" },
      buildDeps({
        webPushSubscriptions: webPushSubscriptionsPort,
        getProfileEmailFields: async () => ({ email: null, emailVerifiedAt: null }),
      }),
    );
    expect(result.selectedChannels).toContain("web_push");
    expect(result.webPushDelivered).toBe(1);
    expect(sendWebPushMock).toHaveBeenCalledTimes(1);
  });

  it("records web_push provider errors and deactivated subscriptions", async () => {
    sendWebPushMock.mockResolvedValue({ delivered: 0, errors: 2, deactivated: 1 });
    const result = await runPatientReminderIntegratorNotify(
      { ...baseBody, topicCode: "training_reminders" },
      buildDeps({
        getProfileEmailFields: async () => ({ email: null, emailVerifiedAt: null }),
      }),
    );
    expect(result.webPushErrors).toBe(2);
    expect(result.webPushDelivered).toBe(0);
    expect(result.webPushDeactivated).toBe(1);
  });

  it("sends email when selected and not rate limited (via relayOutbound)", async () => {
    const result = await runPatientReminderIntegratorNotify(baseBody, buildDeps());
    expect(result.selectedChannels).toContain("email");
    expect(result.emailOk).toBe(true);
    // S10: relay-outbound used instead of sendTransactionalSmtpEmail
    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "email", metadata: expect.objectContaining({ subject: expect.any(String) }) }),
    );
  });

  it("skips email with rate_limited in skippedChannels", async () => {
    const result = await runPatientReminderIntegratorNotify(baseBody, buildDeps({
      reminderTransactionalEmailCooldown: {
        shouldSkipDueToCooldown: async () => true,
        recordSent: async () => undefined,
      },
    }));
    expect(result.emailSkipped).toBe("rate_limited");
    expect(relayOutboundMock).not.toHaveBeenCalled();
    const skipped = result.skippedChannels as Array<{ channel: string; reason: string }>;
    expect(skipped.find((s) => s.channel === "email" && s.reason === "rate_limited")).toBeDefined();
  });
});
