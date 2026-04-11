import { describe, expect, it, vi, beforeEach } from "vitest";

const { errorMock, debugMock } = vi.hoisted(() => ({
  errorMock: vi.fn(),
  debugMock: vi.fn(),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    error: errorMock,
    debug: debugMock,
  },
}));

vi.mock("@/config/env", () => ({
  env: { NODE_ENV: "development" },
}));

import {
  isOAuthStartRateLimitedByKey,
  resolveOAuthStartRateLimitClientKey,
  OAUTH_START_FALLBACK_CLIENT_KEY,
} from "./oauthStartRateLimit";

describe("oauthStartRateLimit (non-production)", () => {
  beforeEach(() => {
    errorMock.mockClear();
    debugMock.mockClear();
  });

  it("resolveOAuthStartRateLimitClientKey uses X-Real-Ip when set", () => {
    const r = new Request("http://localhost/x", {
      headers: { "x-real-ip": " 198.51.100.2 " },
    });
    expect(resolveOAuthStartRateLimitClientKey(r)).toEqual({ ok: true, key: "198.51.100.2" });
    expect(errorMock).not.toHaveBeenCalled();
    expect(debugMock).not.toHaveBeenCalled();
  });

  it("ignores X-Forwarded-For (not trusted for rate limit key)", () => {
    const r = new Request("http://localhost/x", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
    });
    expect(resolveOAuthStartRateLimitClientKey(r)).toEqual({
      ok: true,
      key: OAUTH_START_FALLBACK_CLIENT_KEY,
    });
    expect(debugMock).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "oauth_start_missing_x_real_ip", scope: "auth.oauth_start" }),
    );
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("uses fallback key and logs debug when X-Real-Ip absent (non-production)", () => {
    const r = new Request("http://localhost/x");
    expect(resolveOAuthStartRateLimitClientKey(r)).toEqual({
      ok: true,
      key: OAUTH_START_FALLBACK_CLIENT_KEY,
    });
    expect(debugMock).toHaveBeenCalledTimes(1);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("rate limit still runs with fallback key (in-memory path)", async () => {
    const r = new Request("http://localhost/x");
    const resolved = resolveOAuthStartRateLimitClientKey(r);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("expected fallback key branch");
    expect(resolved.key).toBe(OAUTH_START_FALLBACK_CLIENT_KEY);
    const { key } = resolved;
    for (let i = 0; i < 60; i += 1) {
      expect(await isOAuthStartRateLimitedByKey(key)).toBe(false);
    }
    expect(await isOAuthStartRateLimitedByKey(key)).toBe(true);
  });
});
