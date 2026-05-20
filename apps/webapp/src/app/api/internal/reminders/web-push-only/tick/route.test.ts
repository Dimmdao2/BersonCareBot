import { beforeEach, describe, expect, it, vi } from "vitest";

const { envHolder, runTickMock, recordSuccessMock, recordFailureMock, loggerErrorMock, loggerWarnMock } =
  vi.hoisted(() => ({
    envHolder: { INTERNAL_JOB_SECRET: "test-internal-secret" as string | undefined },
    runTickMock: vi.fn(),
    recordSuccessMock: vi.fn(),
    recordFailureMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/app-layer/reminders/runWebPushOnlyReminderInternalTick", () => ({
  runWebPushOnlyReminderInternalTick: runTickMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
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
    loggerErrorMock.mockReset();
    loggerWarnMock.mockReset();
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
    runTickMock.mockResolvedValue(emptyTickResult);
    recordSuccessMock.mockResolvedValue(undefined);
    recordFailureMock.mockResolvedValue(undefined);
  });

  it("returns 401 when bearer is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/reminders/web-push-only/tick", { method: "POST" }),
    );
    expect(res.status).toBe(401);
    expect(runTickMock).not.toHaveBeenCalled();
  });

  it("returns 200 with tick summary JSON", async () => {
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
  });

  it("records failure heartbeat when tick throws", async () => {
    runTickMock.mockRejectedValue(new Error("boom"));

    const res = await POST(
      new Request("http://localhost/api/internal/reminders/web-push-only/tick", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );

    expect(res.status).toBe(500);
    expect(recordFailureMock).toHaveBeenCalledTimes(1);
    expect(recordFailureMock.mock.calls[0]?.[0]?.error).toContain("boom");
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
