/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { envHolder, purgeMock, loggerInfoMock } = vi.hoisted(() => ({
  envHolder: { INTERNAL_JOB_SECRET: "test-internal-secret" as string },
  purgeMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/app-layer/media/playbackHourlyRetention", () => ({
  PLAYBACK_HOURLY_STATS_RETENTION_DAYS: 90,
  purgeStalePlaybackHourlyStats: (...args: unknown[]) => purgeMock(...args),
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { info: loggerInfoMock },
}));

import { POST } from "./route";

describe("POST /api/internal/media-playback-stats/retention", () => {
  beforeEach(() => {
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
    purgeMock.mockReset();
    loggerInfoMock.mockReset();
    purgeMock.mockResolvedValue({ deleted: 3, retentionDays: 90, dryRun: false });
  });

  it("returns 503 when INTERNAL_JOB_SECRET is not configured", async () => {
    envHolder.INTERNAL_JOB_SECRET = "";
    const res = await POST(
      new Request("http://localhost/api/internal/media-playback-stats/retention", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(503);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("returns 401 without bearer token", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-playback-stats/retention", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid days query", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-playback-stats/retention?days=0", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(400);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("runs dryRun with parsed days", async () => {
    purgeMock.mockResolvedValueOnce({ deleted: 11, retentionDays: 14, dryRun: true });
    const res = await POST(
      new Request("http://localhost/api/internal/media-playback-stats/retention?dryRun=1&days=14", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(purgeMock).toHaveBeenCalledWith({ dryRun: true, retentionDays: 14 });
    const json = (await res.json()) as { ok: boolean; deleted: number; dryRun: boolean; retentionDays: number };
    expect(json).toEqual({ ok: true, deleted: 11, dryRun: true, retentionDays: 14 });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, deleted: 11, retentionDays: 14 }),
      "media_playback_stats_retention_job",
    );
  });

  it("uses default retentionDays when query is absent", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-playback-stats/retention", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(purgeMock).toHaveBeenCalledWith({ dryRun: false, retentionDays: 90 });
  });
});
