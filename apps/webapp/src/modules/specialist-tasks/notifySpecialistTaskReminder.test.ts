/**
 * P19 migration test (PLAN S14g): web_push leg now uses relayOutbound,
 * not sendWebPushToSubscriptions.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const relayMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayMock,
}));

const getWebPushVapidKeyPairMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: getWebPushVapidKeyPairMock,
}));

import { notifySpecialistTaskReminder } from "./notifySpecialistTaskReminder";
import type { SpecialistTaskRow } from "./types";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";

const baseTask: SpecialistTaskRow = {
  id: "t1",
  ownerUserId: "doc-1",
  patientUserId: null,
  title: "Call",
  description: null,
  dueAt: null,
  remindAt: "2026-06-01T08:00:00.000Z",
  isImportant: false,
  completedAt: null,
  reminderSentAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const webPushStub = {
  listActiveByUserId: vi.fn().mockResolvedValue([]),
  deleteByEndpointIfExists: vi.fn(),
  hasAnyForUserId: vi.fn().mockResolvedValue(false),
} as unknown as WebPushSubscriptionsPort;

describe("notifySpecialistTaskReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no VAPID (push channel not deliverable unless overridden per test)
    getWebPushVapidKeyPairMock.mockResolvedValue(null);
    // Default relay success
    relayMock.mockResolvedValue({ ok: true, status: "accepted" });
  });

  it("returns undeliverable when owner has no reachable channel", async () => {
    const result = await notifySpecialistTaskReminder(baseTask, {
      getReminderChannels: async () => ["telegram"],
      getChannelBindings: async () => ({}),
      getProfileEmail: async () => null,
      webPushSubscriptions: webPushStub,
      systemSettings: { getSetting: vi.fn() },
    });
    expect(result).toEqual({ sent: false, undeliverable: true });
    expect(relayMock).not.toHaveBeenCalled();
  });

  it("returns sent only when relay succeeds", async () => {
    relayMock.mockResolvedValueOnce({ ok: true, status: "accepted" });
    const result = await notifySpecialistTaskReminder(baseTask, {
      getReminderChannels: async () => ["telegram"],
      getChannelBindings: async () => ({ telegramId: "123" }),
      getProfileEmail: async () => null,
      webPushSubscriptions: webPushStub,
      systemSettings: { getSetting: vi.fn() },
    });
    expect(result).toEqual({ sent: true, undeliverable: false });
  });

  it("returns sent false when relay fails but channel exists", async () => {
    relayMock.mockResolvedValueOnce({ ok: false, reason: "dispatch_failed" });
    const result = await notifySpecialistTaskReminder(baseTask, {
      getReminderChannels: async () => ["telegram"],
      getChannelBindings: async () => ({ telegramId: "123" }),
      getProfileEmail: async () => null,
      webPushSubscriptions: webPushStub,
      systemSettings: { getSetting: vi.fn() },
    });
    expect(result).toEqual({ sent: false, undeliverable: false });
  });

  it("delivers web_push via relay-outbound when VAPID configured + subscriptions exist (P19 migrated)", async () => {
    // Arrange: VAPID available, subscription exists
    getWebPushVapidKeyPairMock.mockResolvedValue({
      publicKey: "pub-key",
      privateKey: "priv-key",
    });
    const webPushWithSub = {
      listActiveByUserId: vi.fn().mockResolvedValue([
        { endpoint: "https://push.example.com/sub1", keys: { p256dh: "x", auth: "y" } },
      ]),
      deleteByEndpointIfExists: vi.fn(),
      hasAnyForUserId: vi.fn().mockResolvedValue(true),
    } as unknown as WebPushSubscriptionsPort;

    const result = await notifySpecialistTaskReminder(baseTask, {
      getReminderChannels: async () => ["web_push"],
      getChannelBindings: async () => ({}),
      getProfileEmail: async () => null,
      webPushSubscriptions: webPushWithSub,
      systemSettings: { getSetting: vi.fn() },
    });

    expect(result).toEqual({ sent: true, undeliverable: false });
    // P19: web_push now emits a relay-outbound intent, NOT a direct sendWebPushToSubscriptions call.
    expect(relayMock).toHaveBeenCalledOnce();
    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "web_push",
        recipient: "doc-1",
        text: "Call",
        metadata: expect.objectContaining({
          title: "Задача",
          url: "/app/doctor#doctor-today-global-tasks",
          pushExtras: { tag: "specialist_task:t1" },
        }),
      }),
    );
  });

  it("includes patient URL in web_push relay when patientUserId is set", async () => {
    getWebPushVapidKeyPairMock.mockResolvedValue({ publicKey: "pub", privateKey: "priv" });
    const taskWithPatient: SpecialistTaskRow = {
      ...baseTask,
      patientUserId: "patient-99",
    };
    const webPushWithSub = {
      listActiveByUserId: vi.fn().mockResolvedValue([
        { endpoint: "https://push.example.com/sub1", keys: { p256dh: "x", auth: "y" } },
      ]),
      deleteByEndpointIfExists: vi.fn(),
      hasAnyForUserId: vi.fn().mockResolvedValue(true),
    } as unknown as WebPushSubscriptionsPort;

    await notifySpecialistTaskReminder(taskWithPatient, {
      getReminderChannels: async () => ["web_push"],
      getChannelBindings: async () => ({}),
      getProfileEmail: async () => null,
      webPushSubscriptions: webPushWithSub,
      systemSettings: { getSetting: vi.fn() },
    });

    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "web_push",
        metadata: expect.objectContaining({
          url: "/app/doctor/clients/patient-99#doctor-client-section-tasks",
        }),
      }),
    );
  });

  it("skips web_push relay when VAPID not configured", async () => {
    // VAPID returns null → no deliverable channel → undeliverable
    getWebPushVapidKeyPairMock.mockResolvedValue(null);
    const webPushNoVapid = {
      listActiveByUserId: vi.fn().mockResolvedValue([
        { endpoint: "https://push.example.com/sub1", keys: { p256dh: "x", auth: "y" } },
      ]),
      deleteByEndpointIfExists: vi.fn(),
      hasAnyForUserId: vi.fn().mockResolvedValue(true),
    } as unknown as WebPushSubscriptionsPort;

    const result = await notifySpecialistTaskReminder(baseTask, {
      getReminderChannels: async () => ["web_push"],
      getChannelBindings: async () => ({}),
      getProfileEmail: async () => null,
      webPushSubscriptions: webPushNoVapid,
      systemSettings: { getSetting: vi.fn() },
    });

    expect(result).toEqual({ sent: false, undeliverable: true });
    expect(relayMock).not.toHaveBeenCalled();
  });

  it("skips web_push relay when no subscriptions exist", async () => {
    getWebPushVapidKeyPairMock.mockResolvedValue({ publicKey: "pub", privateKey: "priv" });
    const webPushNoSub = {
      listActiveByUserId: vi.fn().mockResolvedValue([]),
      deleteByEndpointIfExists: vi.fn(),
      hasAnyForUserId: vi.fn().mockResolvedValue(false),
    } as unknown as WebPushSubscriptionsPort;

    const result = await notifySpecialistTaskReminder(baseTask, {
      getReminderChannels: async () => ["web_push"],
      getChannelBindings: async () => ({}),
      getProfileEmail: async () => null,
      webPushSubscriptions: webPushNoSub,
      systemSettings: { getSetting: vi.fn() },
    });

    expect(result).toEqual({ sent: false, undeliverable: true });
    expect(relayMock).not.toHaveBeenCalled();
  });

  it("returns sent false when web_push relay fails", async () => {
    getWebPushVapidKeyPairMock.mockResolvedValue({ publicKey: "pub", privateKey: "priv" });
    relayMock.mockResolvedValue({ ok: false, reason: "relay_error" });
    const webPushWithSub = {
      listActiveByUserId: vi.fn().mockResolvedValue([
        { endpoint: "https://push.example.com/sub1", keys: { p256dh: "x", auth: "y" } },
      ]),
      deleteByEndpointIfExists: vi.fn(),
      hasAnyForUserId: vi.fn().mockResolvedValue(true),
    } as unknown as WebPushSubscriptionsPort;

    const result = await notifySpecialistTaskReminder(baseTask, {
      getReminderChannels: async () => ["web_push"],
      getChannelBindings: async () => ({}),
      getProfileEmail: async () => null,
      webPushSubscriptions: webPushWithSub,
      systemSettings: { getSetting: vi.fn() },
    });

    expect(result).toEqual({ sent: false, undeliverable: false });
  });
});
