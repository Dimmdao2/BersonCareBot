import { describe, expect, it } from "vitest";
import type { AppSession, UserRole } from "@/shared/types/session";
import {
  renewSessionIfActive,
  shouldRenewSession,
  decodeSessionCookie,
  encodeSessionCookie,
  sessionTtlSecondsForRole,
  SESSION_SLIDING_TTL_SECONDS,
  SESSION_SLIDING_TTL_STAFF_SECONDS,
} from "@/modules/auth/sessionCookie";

function makeSession(issuedAt: number, expiresAt: number, role: UserRole = "client"): AppSession {
  return {
    user: {
      userId: "u1",
      role,
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

  it("keeps a bounded TEST visual session non-renewable", () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 30 * 60;
    const session: AppSession = {
      ...makeSession(issuedAt, expiresAt),
      user: {
        ...makeSession(issuedAt, expiresAt).user,
        role: "admin",
      },
      adminMode: true,
      operatorSession: { purpose: "test_global_admin_visual", expiresAt },
    };

    const decoded = decodeSessionCookie(encodeSessionCookie(session));
    expect(decoded?.operatorSession).toEqual({ purpose: "test_global_admin_visual", expiresAt });
    expect(shouldRenewSession(session, issuedAt)).toBe(false);
    expect(renewSessionIfActive(session)).toBe(session);
  });

  it("rejects a bounded marker whose expiry differs from the signed session expiry", () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const session: AppSession = {
      ...makeSession(issuedAt, issuedAt + 600),
      operatorSession: { purpose: "test_global_admin_visual", expiresAt: issuedAt + 601 },
    };
    expect(decodeSessionCookie(encodeSessionCookie(session))).toBeNull();
  });

  it("rejects a malformed bounded marker without throwing", () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const session: AppSession = {
      ...makeSession(issuedAt, issuedAt + 600),
      operatorSession: null as unknown as AppSession["operatorSession"],
    };
    expect(decodeSessionCookie(encodeSessionCookie(session))).toBeNull();
  });
});

describe("sessionTtlSecondsForRole (D1 owner ruling 2026-07-24)", () => {
  it("gives staff (doctor) a 7-day sliding TTL", () => {
    expect(sessionTtlSecondsForRole("doctor")).toBe(60 * 60 * 24 * 7);
    expect(sessionTtlSecondsForRole("doctor")).toBe(SESSION_SLIDING_TTL_STAFF_SECONDS);
  });

  it("gives global-admin a 7-day sliding TTL, same bucket as doctor", () => {
    expect(sessionTtlSecondsForRole("admin")).toBe(60 * 60 * 24 * 7);
    expect(sessionTtlSecondsForRole("admin")).toBe(SESSION_SLIDING_TTL_STAFF_SECONDS);
  });

  it("leaves the patient (client) TTL at 90 days, unchanged", () => {
    expect(sessionTtlSecondsForRole("client")).toBe(60 * 60 * 24 * 90);
    expect(sessionTtlSecondsForRole("client")).toBe(SESSION_SLIDING_TTL_SECONDS);
  });

  it("renews a doctor session once less than half of the 7-day TTL remains", () => {
    const now = 1_700_000_000;
    const ttl = SESSION_SLIDING_TTL_STAFF_SECONDS;
    const freshEnough = makeSession(now - 100, now + ttl, "doctor");
    const staleEnough = makeSession(now - 100, now + ttl / 4, "doctor");
    expect(shouldRenewSession(freshEnough, now)).toBe(false);
    expect(shouldRenewSession(staleEnough, now)).toBe(true);
  });

  it("a real (encoded/decoded) doctor cookie past its 7-day expiry is rejected, not kept alive on the old 90-day scale", () => {
    const now = Math.floor(Date.now() / 1000);
    // A doctor cookie whose signed expiresAt already sits 1 second in the past. Under the old
    // (pre-D1) shared 90-day constant this offset would still be "fresh"; decodeSessionCookie
    // must reject strictly on the signed expiresAt regardless of role, so a short-TTL doctor
    // cookie that has actually expired is never resurrected.
    const session = makeSession(now - 60 * 60 * 24 * 7 - 1, now - 1, "doctor");
    const encoded = encodeSessionCookie(session);
    expect(decodeSessionCookie(encoded)).toBeNull();
  });

  it("renews an admin session once less than half of its own 7-day TTL remains, same rule as doctor", () => {
    const now = 1_700_000_000;
    const ttl = SESSION_SLIDING_TTL_STAFF_SECONDS;
    const freshEnough = makeSession(now - 100, now + ttl, "admin");
    const staleEnough = makeSession(now - 100, now + ttl / 4, "admin");
    expect(shouldRenewSession(freshEnough, now)).toBe(false);
    expect(shouldRenewSession(staleEnough, now)).toBe(true);
  });

  it("renewSessionIfActive extends a staff session by the 7-day staff TTL, not the 90-day patient TTL", () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 100;
    const session = makeSession(issuedAt, issuedAt + 1000, "doctor");
    const renewed = renewSessionIfActive(session);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(renewed.expiresAt).toBeGreaterThanOrEqual(nowSec + SESSION_SLIDING_TTL_STAFF_SECONDS - 5);
    expect(renewed.expiresAt).toBeLessThanOrEqual(nowSec + SESSION_SLIDING_TTL_STAFF_SECONDS + 5);
    // Sanity: proves the extension genuinely used the shorter staff bucket, not the patient one.
    expect(renewed.expiresAt).toBeLessThan(nowSec + SESSION_SLIDING_TTL_SECONDS);
  });
});
