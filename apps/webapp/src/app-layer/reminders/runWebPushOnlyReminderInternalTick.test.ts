import { beforeEach, describe, expect, it, vi } from "vitest";

const { runTickMock, recordSuccessMock, loggerWarnMock } = vi.hoisted(() => ({
  runTickMock: vi.fn(),
  recordSuccessMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/modules/reminders/webPushOnlyScheduler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/reminders/webPushOnlyScheduler")>();
  return {
    ...actual,
    runWebPushOnlyReminderTick: runTickMock,
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    channelPreferencesPort: {},
    topicChannelPrefs: {},
    webPushSubscriptions: {},
    systemSettings: {},
    readReminderNotifyGate: {},
    notificationDelivery: {},
    operatorHealthWrite: {
      recordWebPushOnlyReminderTickSuccess: recordSuccessMock,
    },
    contentSections: {
      getBySlug: vi.fn(async () => null),
    },
  })),
}));

vi.mock("@/infra/repos/pgWebPushOnlyReminders", () => ({
  pgWebPushOnlyRemindersPort: {},
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(() => ({})),
}));

vi.mock("@/modules/reminders/loadWarmupsSectionSlugs", () => ({
  loadWarmupsSectionSlugs: vi.fn(async () => []),
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { warn: loggerWarnMock },
}));

import { runWebPushOnlyReminderInternalTick } from "./runWebPushOnlyReminderInternalTick";

describe("runWebPushOnlyReminderInternalTick", () => {
  beforeEach(() => {
    runTickMock.mockReset();
    recordSuccessMock.mockReset();
    loggerWarnMock.mockReset();
    recordSuccessMock.mockResolvedValue(undefined);
    runTickMock.mockResolvedValue({
      rulesFound: 1,
      plannedUpserts: 0,
      dueClaimed: 0,
      dispatched: 0,
      sent: 0,
      skipped: 0,
      skippedNoSubscription: 0,
      skippedNoTopic: 0,
      failed: 0,
    });
  });

  it("records success heartbeat in operator_job_status", async () => {
    await runWebPushOnlyReminderInternalTick();
    expect(recordSuccessMock).toHaveBeenCalledTimes(1);
    expect(recordSuccessMock.mock.calls[0]?.[0]?.metaJson).toMatchObject({
      rulesFound: 1,
      sent: 0,
      consecutiveCronFailures: 0,
    });
  });

  it("returns tick result even when heartbeat write fails", async () => {
    recordSuccessMock.mockRejectedValue(new Error("db down"));
    const result = await runWebPushOnlyReminderInternalTick();
    expect(result.rulesFound).toBe(1);
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});
