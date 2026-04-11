import { describe, expect, it, vi, beforeEach } from "vitest";

const { errorMock } = vi.hoisted(() => ({
  errorMock: vi.fn(),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    error: errorMock,
    debug: vi.fn(),
  },
}));

vi.mock("@/config/env", () => ({
  env: { NODE_ENV: "production" },
}));

import {
  isOAuthStartRateLimitedByKey,
  resolveOAuthStartRateLimitClientKey,
} from "./oauthStartRateLimit";

describe("oauthStartRateLimit (production)", () => {
  beforeEach(() => {
    errorMock.mockClear();
  });

  it("resolveOAuthStartRateLimitClientKey fails closed when X-Real-Ip missing", () => {
    const r = new Request("http://localhost/x");
    expect(resolveOAuthStartRateLimitClientKey(r)).toEqual({
      ok: false,
      reason: "missing_x_real_ip",
    });
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "oauth_start_x_real_ip_required",
        scope: "auth.oauth_start",
        reason: "missing_x_real_ip",
      }),
    );
  });

  it("resolveOAuthStartRateLimitClientKey fails closed when X-Real-Ip is whitespace only", () => {
    const r = new Request("http://localhost/x", {
      headers: { "x-real-ip": "   " },
    });
    expect(resolveOAuthStartRateLimitClientKey(r)).toEqual({
      ok: false,
      reason: "missing_x_real_ip",
    });
  });

  it("rate limit by key works with valid X-Real-Ip (in-memory path)", async () => {
    const key = "198.51.100.9";
    for (let i = 0; i < 60; i += 1) {
      expect(await isOAuthStartRateLimitedByKey(key)).toBe(false);
    }
    expect(await isOAuthStartRateLimitedByKey(key)).toBe(true);
  });
});
