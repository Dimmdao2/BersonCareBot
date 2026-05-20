import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  envHolder,
  runTickMock,
  recordSuccessMock,
  recordFailureMock,
  getOperatorJobStatusMock,
  loggerErrorMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  envHolder: { INTERNAL_JOB_SECRET: "test-internal-secret" as string | undefined },
  runTickMock: vi.fn(),
  recordSuccessMock: vi.fn(),
  recordFailureMock: vi.fn(),
  getOperatorJobStatusMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/modules/reminders/webPushOnlyScheduler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/reminders/webPushOnlyScheduler")>();
  return {
    ...actual,
    runWebPushOnlyReminderTick: runTickMock,
  };
});

vi.mock("@/infra/repos/pgWebPushOnlyReminders", () => ({
  pgWebPushOnlyRemindersPort: {},
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    channelPreferencesPort: {},
    topicChannelPrefs: {},
    webPushSubscriptions: {},
    systemSettings: {},
    readReminderNotifyGate: {},
    notificationDelivery: {},
    operatorHealthRead: {
      getOperatorJobStatus: getOperatorJobStatusMock,
    },
    operatorHealthWrite: {
      recordWebPushOnlyReminderTickSuccess: recordSuccessMock,
      recordWebPushOnlyReminderTickFailure: recordFailureMock,
    },
  })),
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
  },
}));

import { POST } from "./route";

const emptyTickResult = {
  rulesFound: 1,
  plannedUpserts: 0,
  dueClaimed: 0,
  dispatched: 0,
  sent: 0,
  skipped: 0,
  skippedNoSubscription: 0,
  skippedNoTopic: 0,
  failed: 0,
};

describe("POST /api/internal/reminders/web-push-only/tick", () => {
  beforeEach(() => {
    runTickMock.mockReset();
    recordSuccessMock.mockReset();
    recordFailureMock.mockReset();
    getOperatorJobStatusMock.mockReset();
    loggerErrorMock.mockReset();
    loggerWarnMock.mockReset();
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
    runTickMock.mockResolvedValue(emptyTickResult);
    recordSuccessMock.mockResolvedValue(undefined);
    recordFailureMock.mockResolvedValue(undefined);
    getOperatorJobStatusMock.mockResolvedValue(null);
  });

  it("returns 401 when bearer is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/reminders/web-push-only/tick", { method: "POST" }),
    );
    expect(res.status).toBe(401);
    expect(runTickMock).not.toHaveBeenCalled();
  });

  it("returns 200 with tick summary JSON and records success heartbeat", async () => {
    runTickMock.mockResolvedValue({ ...emptyTickResult, sent: 1 });
    const res = await POST(
      new Request("http://localhost/api/internal/reminders/web-push-only/tick?limit=50", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; sent: number; planned: number };
    expect(json.ok).toBe(true);
    expect(json.sent).toBe(1);
    expect(json.planned).toBe(0);
    expect(recordSuccessMock).toHaveBeenCalledTimes(1);
    expect(recordSuccessMock.mock.calls[0]?.[0]?.metaJson).toMatchObject({
      sent: 1,
      consecutiveCronFailures: 0,
    });
    expect(recordFailureMock).not.toHaveBeenCalled();
  });

  it("records failure heartbeat when tick throws", async () => {
    runTickMock.mockRejectedValue(new Error("boom"));
    getOperatorJobStatusMock.mockResolvedValue({
      jobKey: "reminders.web_push_only.tick",
      jobFamily: "reminders",
      lastStatus: "failure",
      metaJson: { consecutiveCronFailures: 2 },
    });

    const res = await POST(
      new Request("http://localhost/api/internal/reminders/web-push-only/tick", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );

    expect(res.status).toBe(500);
    expect(recordFailureMock).toHaveBeenCalledTimes(1);
    expect(recordFailureMock.mock.calls[0]?.[0]?.error).toContain("boom");
    expect(recordFailureMock.mock.calls[0]?.[0]?.metaJson).toEqual({ consecutiveCronFailures: 3 });
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
