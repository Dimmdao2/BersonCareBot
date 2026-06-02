import { beforeEach, describe, expect, it, vi } from "vitest";

const { envHolder, dispatchMock } = vi.hoisted(() => {
  const envHolder = { INTERNAL_JOB_SECRET: "test-internal-secret" as string | undefined };
  const dispatchMock = vi.fn();
  return { envHolder, dispatchMock };
});

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({})),
}));

vi.mock("@/modules/specialist-tasks/dispatchDueReminders", () => ({
  dispatchDueSpecialistTaskReminders: dispatchMock,
}));

vi.mock("@/app-layer/operator-health/recordOperatorCronJobTick", () => ({
  recordOperatorCronJobTickBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

describe("POST /api/internal/specialist-task-reminders/tick", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
  });

  it("returns 503 when INTERNAL_JOB_SECRET is not configured", async () => {
    envHolder.INTERNAL_JOB_SECRET = "";
    const res = await POST(
      new Request("http://localhost/api/internal/specialist-task-reminders/tick", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
      }),
    );
    expect(res.status).toBe(503);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/specialist-task-reminders/tick", { method: "POST" }),
    );
    expect(res.status).toBe(401);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("returns 200 with dispatch result", async () => {
    dispatchMock.mockResolvedValue({ processed: 2, sent: 1, errors: 0 });
    const res = await POST(
      new Request("http://localhost/api/internal/specialist-task-reminders/tick?limit=10", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; processed: number; sent: number };
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(2);
    expect(body.sent).toBe(1);
    expect(dispatchMock).toHaveBeenCalledWith(expect.anything(), { limit: 10 });
  });
});
