import { describe, expect, it, vi } from "vitest";
import { isOAuthStartRateLimited, oauthStartClientKeyFromRequest } from "./oauthStartRateLimit";

vi.mock("@/config/env", () => ({
  env: {},
}));

describe("oauthStartRateLimit", () => {
  it("oauthStartClientKeyFromRequest prefers first X-Forwarded-For hop", () => {
    const r = new Request("http://localhost/x", {
      headers: { "x-forwarded-for": " 203.0.113.1 , 10.0.0.1" },
    });
    expect(oauthStartClientKeyFromRequest(r)).toBe("203.0.113.1");
  });

  it("falls back to X-Real-Ip", () => {
    const r = new Request("http://localhost/x", {
      headers: { "x-real-ip": "198.51.100.2" },
    });
    expect(oauthStartClientKeyFromRequest(r)).toBe("198.51.100.2");
  });

  it("returns null when no proxy client IP — rate limit skipped", async () => {
    const r = new Request("http://localhost/x");
    expect(oauthStartClientKeyFromRequest(r)).toBeNull();
    for (let i = 0; i < 5; i += 1) {
      expect(await isOAuthStartRateLimited(r)).toBe(false);
    }
  });
});
