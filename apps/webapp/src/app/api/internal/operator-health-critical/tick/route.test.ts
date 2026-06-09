import { beforeEach, describe, expect, it, vi } from "vitest";

const { envHolder, runTickMock } = vi.hoisted(() => {
  const envHolder = { INTERNAL_JOB_SECRET: "test-internal-secret" as string | undefined };
  const runTickMock = vi.fn();
  return { envHolder, runTickMock };
});

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/app-layer/health/runOperatorHealthCriticalTick", () => ({
  runOperatorHealthCriticalTick: runTickMock,
}));

vi.mock("@/app-layer/operator-health/recordOperatorCronJobTick", () => ({
  recordOperatorCronJobTickBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

describe("POST /api/internal/operator-health-critical/tick", () => {
  beforeEach(() => {
    runTickMock.mockReset();
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
  });

  it("returns 401 when bearer is wrong", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/operator-health-critical/tick", { method: "POST" }),
    );
    expect(res.status).toBe(401);
    expect(runTickMock).not.toHaveBeenCalled();
  });

  it("returns 200 with alerted count and keys", async () => {
    runTickMock.mockResolvedValue({ alerted: 1, keys: ["critical:webapp_db:down"] });
    const res = await POST(
      new Request("http://localhost/api/internal/operator-health-critical/tick", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; alerted: number; keys: string[] };
    expect(body.ok).toBe(true);
    expect(body.alerted).toBe(1);
    expect(body.keys).toEqual(["critical:webapp_db:down"]);
  });

  it("returns alerted 0 when dedup blocks dispatch", async () => {
    runTickMock.mockResolvedValue({ alerted: 0, keys: [] });
    const res = await POST(
      new Request("http://localhost/api/internal/operator-health-critical/tick", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alerted: number };
    expect(body.alerted).toBe(0);
  });
});
