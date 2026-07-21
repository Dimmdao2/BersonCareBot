import { beforeEach, describe, expect, it, vi } from "vitest";

const { errorMock, warnMock } = vi.hoisted(() => ({
  errorMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    error: errorMock,
    warn: warnMock,
  },
}));

vi.mock("@/config/env", () => ({
  env: { NODE_ENV: "production" },
}));

import { resolveClientBootReportRateLimitClientKey } from "./clientBootReportRateLimit";

describe("client boot report trusted proxy identity", () => {
  beforeEach(() => {
    errorMock.mockClear();
    warnMock.mockClear();
  });

  it("fails closed with a warning when production X-Real-IP is missing", () => {
    expect(resolveClientBootReportRateLimitClientKey(new Request("http://localhost/x"))).toEqual({
      ok: false,
      reason: "missing_x_real_ip",
    });
    expect(warnMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "patient_client_env",
      event: "unsupported_client_boot",
      reason: "missing_x_real_ip",
    }));
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("uses only the trusted proxy header", () => {
    expect(resolveClientBootReportRateLimitClientKey(new Request("http://localhost/x", {
      headers: {
        "x-forwarded-for": "203.0.113.1",
        "x-real-ip": "198.51.100.4",
      },
    }))).toEqual({ ok: true, key: "198.51.100.4" });
    expect(warnMock).not.toHaveBeenCalled();
  });
});
