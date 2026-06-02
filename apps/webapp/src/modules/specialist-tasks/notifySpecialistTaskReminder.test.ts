import { describe, expect, it, vi } from "vitest";

const relayMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayMock,
}));

vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: vi.fn().mockResolvedValue(null),
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
} as unknown as WebPushSubscriptionsPort;

describe("notifySpecialistTaskReminder", () => {
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
});
