import { describe, expect, it } from "vitest";
import type { AppSession } from "@/shared/types/session";
import {
  renewSessionIfActive,
  shouldRenewSession,
  decodeSessionCookie,
  encodeSessionCookie,
} from "@/modules/auth/sessionCookie";

function makeSession(issuedAt: number, expiresAt: number): AppSession {
  return {
    user: {
      userId: "u1",
      role: "client",
      displayName: "Test",
      bindings: {},
    },
    issuedAt,
    expiresAt,
  };
}

describe("sessionCookie sliding", () => {
  const now = 1_700_000_000;

  it("shouldRenew when less than half TTL remains", () => {
    const ttl = 60 * 60 * 24 * 90;
    const session = makeSession(now - 100, now + ttl / 4);
    expect(shouldRenewSession(session, now)).toBe(true);
  });

  it("shouldRenew after 24h since issuedAt", () => {
    const ttl = 60 * 60 * 24 * 90;
    const session = makeSession(now - 60 * 60 * 25, now + ttl - 1000);
    expect(shouldRenewSession(session, now)).toBe(true);
  });

  it("should not renew when recently issued and plenty of TTL left", () => {
    const ttl = 60 * 60 * 24 * 90;
    const session = makeSession(now, now + ttl);
    expect(shouldRenewSession(session, now)).toBe(false);
  });

  it("renewSessionIfActive extends expiresAt", () => {
    const ttl = 60 * 60 * 24 * 90;
    const issuedAt = Math.floor(Date.now() / 1000) - 100;
    const session = makeSession(issuedAt, issuedAt + 1000);
    const renewed = renewSessionIfActive(session);
    const expectedMin = Math.floor(Date.now() / 1000) + ttl - 5;
    const expectedMax = Math.floor(Date.now() / 1000) + ttl + 5;
    expect(renewed.expiresAt).toBeGreaterThanOrEqual(expectedMin);
    expect(renewed.expiresAt).toBeLessThanOrEqual(expectedMax);
    expect(renewed.issuedAt).toBe(session.issuedAt);
  });

  it("round-trips encode/decode", () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const session = makeSession(issuedAt, issuedAt + 60 * 60 * 24);
    const raw = encodeSessionCookie(session);
    const decoded = decodeSessionCookie(raw);
    expect(decoded?.user.userId).toBe("u1");
    expect(decoded?.expiresAt).toBe(session.expiresAt);
  });
});
