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

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app-layer/media/hlsProxyErrorEvents", () => ({
  MEDIA_HLS_PROXY_ERROR_RETENTION_DAYS_DEFAULT: 90,
  purgeStaleMediaHlsProxyErrorEvents: (...args: unknown[]) => purgeMock(...args),
}));

import { POST } from "./route";

describe("POST /api/internal/media-hls-proxy-errors/retention", () => {
  beforeEach(() => {
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
    purgeMock.mockReset();
    loggerInfoMock.mockReset();
    purgeMock.mockResolvedValue({ deleted: 3, dryRun: false, retentionDays: 90 });
  });

  it("returns 503 when INTERNAL_JOB_SECRET is not configured", async () => {
    envHolder.INTERNAL_JOB_SECRET = "";
    const res = await POST(
      new Request("http://localhost/api/internal/media-hls-proxy-errors/retention", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
      }),
    );
    expect(res.status).toBe(503);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer secret mismatches", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-hls-proxy-errors/retention", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("returns 400 when days invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-hls-proxy-errors/retention?days=0", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(400);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("runs dry run without deleting when dryRun=1", async () => {
    purgeMock.mockResolvedValueOnce({ deleted: 12, dryRun: true, retentionDays: 14 });
    const res = await POST(
      new Request("http://localhost/api/internal/media-hls-proxy-errors/retention?dryRun=1&days=14", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; deleted?: number; dryRun?: boolean };
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(12);
    expect(body.dryRun).toBe(true);
    expect(purgeMock).toHaveBeenCalledWith({ dryRun: true, retentionDays: 14 });
  });

  it("runs purge when authorized", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-hls-proxy-errors/retention", {
        method: "POST",
        headers: { Authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(purgeMock).toHaveBeenCalledWith({ dryRun: false, retentionDays: 90 });
  });
});
