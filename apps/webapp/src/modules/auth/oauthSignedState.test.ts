import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@/config/env", () => ({
  env: { SESSION_COOKIE_SECRET: "test-session-secret-16chars" },
}));

import { createSignedOAuthState, verifySignedOAuthState } from "./oauthSignedState";

describe("oauthSignedState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies token for matching purpose", () => {
    const t = createSignedOAuthState("yandex", 600);
    expect(verifySignedOAuthState(t, "yandex")).toBe(true);
    expect(verifySignedOAuthState(t, "gcal")).toBe(false);
  });

  it("verifies gcal token only as gcal", () => {
    const t = createSignedOAuthState("gcal", 600);
    expect(verifySignedOAuthState(t, "gcal")).toBe(true);
    expect(verifySignedOAuthState(t, "yandex")).toBe(false);
  });

  it("rejects tampered token", () => {
    const t = createSignedOAuthState("yandex", 600);
    const parts = t.split(".");
    parts[2] = "AAAA";
    expect(verifySignedOAuthState(parts.join("."), "yandex")).toBe(false);
  });

  it("rejects expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    const t = createSignedOAuthState("yandex", 60);
    vi.setSystemTime(new Date("2025-01-01T00:02:00Z"));
    expect(verifySignedOAuthState(t, "yandex")).toBe(false);
  });
});
