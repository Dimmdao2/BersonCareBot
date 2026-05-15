import { beforeEach, describe, expect, it, vi } from "vitest";

const { envHolder, runTickMock } = vi.hoisted(() => {
  const envHolder = { INTERNAL_JOB_SECRET: "test-internal-secret" as string | undefined };
  const runTickMock = vi.fn();
  return { envHolder, runTickMock };
});

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/app-layer/health/runIntegratorPushOutboxHealthGuardTick", () => ({
  runIntegratorPushOutboxHealthGuardTick: runTickMock,
}));

import { POST } from "./route";

describe("POST /api/internal/system-health-guard/tick", () => {
  beforeEach(() => {
    runTickMock.mockReset();
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
  });

  it("returns 503 when INTERNAL_JOB_SECRET is not configured", async () => {
    envHolder.INTERNAL_JOB_SECRET = "";
    const res = await POST(
      new Request("http://localhost/api/internal/system-health-guard/tick", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
      }),
    );
    expect(res.status).toBe(503);
    expect(runTickMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer is missing or wrong", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/system-health-guard/tick", { method: "POST" }),
    );
    expect(res.status).toBe(401);
    expect(runTickMock).not.toHaveBeenCalled();
  });

  it("returns 200 with tick result", async () => {
    runTickMock.mockResolvedValue({ status: "ok", alerted: false });
    const res = await POST(
      new Request("http://localhost/api/internal/system-health-guard/tick", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string; alerted: boolean };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("ok");
    expect(body.alerted).toBe(false);
    expect(runTickMock).toHaveBeenCalledTimes(1);
  });
});
