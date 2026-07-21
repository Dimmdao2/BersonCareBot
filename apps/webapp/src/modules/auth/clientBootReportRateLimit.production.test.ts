import { beforeEach, describe, expect, it, vi } from "vitest";

const { errorMock, warnMock, limiterMock, envMock } = vi.hoisted(() => ({
  errorMock: vi.fn(),
  warnMock: vi.fn(),
  limiterMock: vi.fn(),
  envMock: { NODE_ENV: "production", SESSION_COOKIE_SECRET: "test-session-secret-for-client-boot" },
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    error: errorMock,
    warn: warnMock,
  },
}));

vi.mock("@/config/env", () => ({
  env: envMock,
}));

vi.mock("@/modules/auth/authRateLimits", () => ({
  isClientBootReportRateLimitedByKey: limiterMock,
}));

import {
  checkClientBootReportRateLimit,
  resolveClientBootReportRateLimitClientKey,
} from "./clientBootReportRateLimit";

describe("client boot report trusted proxy identity", () => {
  beforeEach(() => {
    errorMock.mockClear();
    warnMock.mockClear();
    limiterMock.mockReset().mockResolvedValue(false);
    envMock.SESSION_COOKIE_SECRET = "test-session-secret-for-client-boot";
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

  it("persists only a purpose-scoped HMAC pseudonym of the trusted proxy header", async () => {
    const rawRealIp = "198.51.100.4";
    const request = new Request("http://localhost/x", {
      headers: {
        "x-forwarded-for": "203.0.113.1",
        "x-real-ip": rawRealIp,
      },
    });
    const identity = resolveClientBootReportRateLimitClientKey(request);
    expect(identity).toEqual({
      ok: true,
      key: expect.stringMatching(/^client-boot:v1:[a-f0-9]{64}$/),
    });
    expect(identity.ok && identity.key).not.toContain(rawRealIp);
    await expect(checkClientBootReportRateLimit(request)).resolves.toBe("ok");
    expect(limiterMock).toHaveBeenCalledWith(identity.ok ? identity.key : "missing");
    expect(limiterMock).not.toHaveBeenCalledWith(rawRealIp);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("fails closed instead of hashing with an absent purpose secret", async () => {
    envMock.SESSION_COOKIE_SECRET = "";
    const request = new Request("http://localhost/x", { headers: { "x-real-ip": "198.51.100.4" } });
    await expect(checkClientBootReportRateLimit(request)).resolves.toBe("configuration_error");
    expect(limiterMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledWith(expect.objectContaining({
      reason: "missing_pseudonymization_secret",
    }));
  });
});
