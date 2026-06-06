import { describe, expect, it, vi } from "vitest";

const notifyMock = vi.hoisted(() => vi.fn());
const resolveChannelsMock = vi.hoisted(() => vi.fn());

vi.mock("./notifySpecialistTaskReminder", () => ({
  notifySpecialistTaskReminder: notifyMock,
}));

vi.mock("@/modules/doctor-notifications/resolveSpecialistTaskReminderChannels", () => ({
  resolveSpecialistTaskReminderChannelsForUser: resolveChannelsMock,
}));

import type { SpecialistTasksService } from "./service";
import { dispatchDueSpecialistTaskReminders, type DispatchSpecialistTaskRemindersDeps } from "./dispatchDueReminders";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";

const baseTask = {
  id: "t1",
  ownerUserId: "doc-1",
  patientUserId: null,
  title: "Test",
  description: null,
  dueAt: null,
  remindAt: "2026-06-01T08:00:00.000Z",
  isImportant: false,
  completedAt: null,
  reminderSentAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("dispatchDueSpecialistTaskReminders", () => {
  it("marks reminder sent only when notify reports delivery", async () => {
    resolveChannelsMock.mockResolvedValue(["telegram"]);
    notifyMock.mockResolvedValue({ sent: false, undeliverable: false });
    const markReminderSent = vi.fn();
    const listDueReminders = vi.fn().mockResolvedValue([baseTask]);

    const deps = {
      specialistTasks: { listDueReminders, markReminderSent } as unknown as SpecialistTasksService,
      topicChannelPrefs: { listByUserId: vi.fn(), upsert: vi.fn() },
      channelPreferences: { getPreferences: vi.fn() },
      getReminderChannels: async () => ["telegram" as const],
      getChannelBindings: vi.fn(),
      getProfileEmail: vi.fn(),
      getProfileEmailVerified: vi.fn(),
      webPushSubscriptions: {
        hasAnyForUserId: vi.fn(),
        listActiveByUserId: vi.fn().mockResolvedValue([]),
        deleteByEndpointIfExists: vi.fn(),
      } as unknown as WebPushSubscriptionsPort,
      systemSettings: { getSetting: vi.fn() },
    } as unknown as DispatchSpecialistTaskRemindersDeps;

    await dispatchDueSpecialistTaskReminders(deps, {
      limit: 10,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(markReminderSent).not.toHaveBeenCalled();

    notifyMock.mockResolvedValue({ sent: true, undeliverable: false });
    markReminderSent.mockClear();
    await dispatchDueSpecialistTaskReminders(
      deps,
      { limit: 10, now: new Date("2026-06-01T12:00:00.000Z") },
    );

    expect(markReminderSent).toHaveBeenCalledWith("t1", "2026-06-01T12:00:00.000Z");
  });

  it("marks reminder sent when notify reports undeliverable (no retry loop)", async () => {
    resolveChannelsMock.mockResolvedValue(["telegram"]);
    notifyMock.mockResolvedValue({ sent: false, undeliverable: true });
    const markReminderSent = vi.fn();
    const listDueReminders = vi.fn().mockResolvedValue([baseTask]);

    const deps = {
      specialistTasks: { listDueReminders, markReminderSent } as unknown as SpecialistTasksService,
      topicChannelPrefs: { listByUserId: vi.fn(), upsert: vi.fn() },
      channelPreferences: { getPreferences: vi.fn() },
      getReminderChannels: async () => ["telegram" as const],
      getChannelBindings: vi.fn(),
      getProfileEmail: vi.fn(),
      getProfileEmailVerified: vi.fn(),
      webPushSubscriptions: {
        hasAnyForUserId: vi.fn(),
        listActiveByUserId: vi.fn().mockResolvedValue([]),
        deleteByEndpointIfExists: vi.fn(),
      } as unknown as WebPushSubscriptionsPort,
      systemSettings: { getSetting: vi.fn() },
    } as unknown as DispatchSpecialistTaskRemindersDeps;

    await dispatchDueSpecialistTaskReminders(deps, {
      limit: 10,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(markReminderSent).toHaveBeenCalledWith("t1", "2026-06-01T12:00:00.000Z");
  });
});
