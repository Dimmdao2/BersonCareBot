import { beforeEach, describe, expect, it, vi } from "vitest";

const { envHolder, runTickMock } = vi.hoisted(() => {
  const envHolder = { INTERNAL_JOB_SECRET: "test-internal-secret" as string | undefined };
  const runTickMock = vi.fn();
  return { envHolder, runTickMock };
});

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/app-layer/health/runOperatorHealthDigestTick", () => ({
  runOperatorHealthDigestTick: runTickMock,
}));

vi.mock("@/app-layer/operator-health/recordOperatorCronJobTick", () => ({
  recordOperatorCronJobTickBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

describe("POST /api/internal/operator-health-digest/tick", () => {
  beforeEach(() => {
    runTickMock.mockReset();
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
  });

  it("returns 401 when bearer is wrong", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/operator-health-digest/tick", { method: "POST" }),
    );
    expect(res.status).toBe(401);
    expect(runTickMock).not.toHaveBeenCalled();
  });

  it("returns 200 with sent flag", async () => {
    runTickMock.mockResolvedValue({ sent: true, dedupKey: "digest:2026-06-09" });
    const res = await POST(
      new Request("http://localhost/api/internal/operator-health-digest/tick", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sent: boolean; dedupKey: string };
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(true);
    expect(body.dedupKey).toBe("digest:2026-06-09");
  });

  it("returns sent false when dedup blocks dispatch", async () => {
    runTickMock.mockResolvedValue({ sent: false, reason: "dedup", dedupKey: "digest:2026-06-09" });
    const res = await POST(
      new Request("http://localhost/api/internal/operator-health-digest/tick", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: boolean; reason: string };
    expect(body.sent).toBe(false);
    expect(body.reason).toBe("dedup");
  });
});
