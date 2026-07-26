import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSession, UserRole } from "@/shared/types/session";
import {
  renewSessionIfActive,
  shouldRenewSession,
  decodeSessionCookie,
  encodeSessionCookie,
  sessionTtlSecondsForRole,
  sessionAbsoluteMaxAgeSecondsForRole,
  isSessionBeyondAbsoluteMaxAge,
  SESSION_SLIDING_TTL_SECONDS,
  SESSION_SLIDING_TTL_STAFF_SECONDS,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS,
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
    const ttl = SESSION_SLIDING_TTL_SECONDS;
    const session = makeSession(now - 100, now + ttl / 4);
    expect(shouldRenewSession(session, now)).toBe(true);
  });

  it("shouldRenew after 24h since issuedAt", () => {
    const ttl = SESSION_SLIDING_TTL_SECONDS;
    const session = makeSession(now - 60 * 60 * 25, now + ttl - 1000);
    expect(shouldRenewSession(session, now)).toBe(true);
  });

  it("should not renew when recently issued and plenty of TTL left", () => {
    const ttl = SESSION_SLIDING_TTL_SECONDS;
    const session = makeSession(now, now + ttl);
    expect(shouldRenewSession(session, now)).toBe(false);
  });

  it("renewSessionIfActive extends expiresAt", () => {
    const ttl = SESSION_SLIDING_TTL_SECONDS;
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

describe("sessionTtlSecondsForRole — idle/renewal TTL (S2 remedy 2026-07-25 supersedes the D1 2026-07-24 sliding values)", () => {
  it("gives staff (doctor) a 12-hour idle TTL", () => {
    expect(sessionTtlSecondsForRole("doctor")).toBe(60 * 60 * 12);
    expect(sessionTtlSecondsForRole("doctor")).toBe(SESSION_SLIDING_TTL_STAFF_SECONDS);
  });

  it("gives global-admin a 12-hour idle TTL, same bucket as doctor", () => {
    expect(sessionTtlSecondsForRole("admin")).toBe(60 * 60 * 12);
    expect(sessionTtlSecondsForRole("admin")).toBe(SESSION_SLIDING_TTL_STAFF_SECONDS);
  });

  it("gives the patient (client) a 30-day idle TTL (was 90 days before the S2 remedy)", () => {
    expect(sessionTtlSecondsForRole("client")).toBe(60 * 60 * 24 * 30);
    expect(sessionTtlSecondsForRole("client")).toBe(SESSION_SLIDING_TTL_SECONDS);
  });

  it("renews a doctor session once less than half of the 12-hour idle TTL remains", () => {
    const now = 1_700_000_000;
    const ttl = SESSION_SLIDING_TTL_STAFF_SECONDS;
    const freshEnough = makeSession(now - 100, now + ttl, "doctor");
    const staleEnough = makeSession(now - 100, now + ttl / 4, "doctor");
    expect(shouldRenewSession(freshEnough, now)).toBe(false);
    expect(shouldRenewSession(staleEnough, now)).toBe(true);
  });

  it("a real (encoded/decoded) doctor cookie past its signed expiry is rejected regardless of role", () => {
    const now = Math.floor(Date.now() / 1000);
    // A doctor cookie whose signed expiresAt already sits 1 second in the past.
    // decodeSessionCookie must reject strictly on the signed expiresAt regardless of role, so a
    // short-idle-TTL doctor cookie that has actually expired is never resurrected.
    const session = makeSession(now - 60 * 60 * 24 * 7 - 1, now - 1, "doctor");
    const encoded = encodeSessionCookie(session);
    expect(decodeSessionCookie(encoded)).toBeNull();
  });

  it("renews an admin session once less than half of its own 12-hour idle TTL remains, same rule as doctor", () => {
    const now = 1_700_000_000;
    const ttl = SESSION_SLIDING_TTL_STAFF_SECONDS;
    const freshEnough = makeSession(now - 100, now + ttl, "admin");
    const staleEnough = makeSession(now - 100, now + ttl / 4, "admin");
    expect(shouldRenewSession(freshEnough, now)).toBe(false);
    expect(shouldRenewSession(staleEnough, now)).toBe(true);
  });

  it("renewSessionIfActive extends a staff session by the 12-hour staff idle TTL, not the 30-day patient idle TTL", () => {
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

describe("absolute session age cap (S2 remedy 2026-07-25 — closes 'replay + renew forever')", () => {
  const now = 1_700_000_000;

  it("carries the pre-remedy TTL values as the hard ceiling: staff 7 days, patient 90 days", () => {
    expect(SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS).toBe(60 * 60 * 24 * 7);
    expect(SESSION_ABSOLUTE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 90);
    expect(sessionAbsoluteMaxAgeSecondsForRole("doctor")).toBe(SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS);
    expect(sessionAbsoluteMaxAgeSecondsForRole("admin")).toBe(SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS);
    expect(sessionAbsoluteMaxAgeSecondsForRole("client")).toBe(SESSION_ABSOLUTE_MAX_AGE_SECONDS);
  });

  it("isSessionBeyondAbsoluteMaxAge: false just inside the boundary, true just outside — staff", () => {
    const justInside = makeSession(now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS - 5), now + 1000, "doctor");
    const justOutside = makeSession(now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS + 5), now + 1000, "doctor");
    expect(isSessionBeyondAbsoluteMaxAge(justInside, now)).toBe(false);
    expect(isSessionBeyondAbsoluteMaxAge(justOutside, now)).toBe(true);
  });

  it("isSessionBeyondAbsoluteMaxAge: false just inside the boundary, true just outside — patient", () => {
    const justInside = makeSession(now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS - 5), now + 1000, "client");
    const justOutside = makeSession(now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS + 5), now + 1000, "client");
    expect(isSessionBeyondAbsoluteMaxAge(justInside, now)).toBe(false);
    expect(isSessionBeyondAbsoluteMaxAge(justOutside, now)).toBe(true);
  });

  it("exempts the bounded TEST global-admin visual session from the cap", () => {
    const veryOld = now - SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS * 10;
    const session: AppSession = {
      ...makeSession(veryOld, now + 1000, "admin"),
      operatorSession: { purpose: "test_global_admin_visual", expiresAt: now + 1000 },
    };
    expect(isSessionBeyondAbsoluteMaxAge(session, now)).toBe(false);
  });

  it("shouldRenewSession refuses to renew a staff session past the absolute cap even though idle TTL alone would allow it", () => {
    // Well past the 7-day cap, but expiresAt (idle-TTL-derived) is still comfortably in the
    // future — proves the cap is checked independently of "remaining < ttl/2".
    const issuedAt = now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS + 10);
    const session = makeSession(issuedAt, now + SESSION_SLIDING_TTL_STAFF_SECONDS, "doctor");
    expect(shouldRenewSession(session, now)).toBe(false);
  });

  it("shouldRenewSession refuses to renew a patient session past the absolute cap", () => {
    const issuedAt = now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS + 10);
    const session = makeSession(issuedAt, now + SESSION_SLIDING_TTL_SECONDS, "client");
    expect(shouldRenewSession(session, now)).toBe(false);
  });

  it("renewSessionIfActive is a no-op past the absolute cap (defense in depth, same contract as shouldRenewSession)", () => {
    const issuedAt = Math.floor(Date.now() / 1000) - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS + 10);
    const session = makeSession(issuedAt, issuedAt + 1000, "doctor");
    expect(renewSessionIfActive(session)).toBe(session);
  });

  it("issuedAt is still preserved across a real (allowed) renewal", () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 100;
    const session = makeSession(issuedAt, issuedAt + 1000, "client");
    const renewed = renewSessionIfActive(session);
    expect(renewed.issuedAt).toBe(issuedAt);
  });
});

describe("sliding renewal cannot outrun the absolute ceiling (S2 remedy 2026-07-25 — simulated clock)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The defect the audit found: `renewSessionIfActive` re-applied the full TTL on every renewal and
   * preserved `issuedAt`, so a cookie replayed at least once per window lived forever. This drives
   * the REAL renewal functions against a moving clock — no arithmetic is re-implemented here — and
   * asserts the session dies at the ceiling however diligently it is renewed.
   */
  function driveRenewals(role: UserRole, ttl: number, ceiling: number) {
    const start = 1_700_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(start * 1000);
    let session = makeSession(start, start + ttl, role);
    let renewals = 0;
    let lastExpiresAt = session.expiresAt;
    // Walk a quarter TTL at a time. Not ttl/2: the renewal window opens strictly INSIDE the second
    // half (`remaining < ttl/2`), and with the 12 h staff TTL the other branch
    // (`now - issuedAt >= RENEW_MIN_INTERVAL_SEC`, 24 h) can never fire before the cookie expires,
    // so a half-TTL walk lands exactly on the closed boundary and never renews at all.
    const step = Math.floor(ttl / 4);
    for (let t = start + step; t <= start + ceiling + ttl * 2; t += step) {
      vi.setSystemTime(t * 1000);
      if (shouldRenewSession(session, t)) {
        session = renewSessionIfActive(session);
        renewals += 1;
        lastExpiresAt = session.expiresAt;
      }
    }
    const endNow = Math.floor(Date.now() / 1000);
    return { session, renewals, lastExpiresAt, endNow, start };
  }

  it("a staff session renewed at every opportunity is dead once past the staff ceiling", () => {
    const ttl = SESSION_SLIDING_TTL_STAFF_SECONDS;
    const ceiling = SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS;
    const { session, renewals, lastExpiresAt, endNow, start } = driveRenewals("doctor", ttl, ceiling);

    expect(renewals).toBeGreaterThan(0); // it really was renewing before the ceiling
    expect(session.issuedAt).toBe(start); // issuedAt is never rewritten by renewal
    // The last renewal cannot have pushed expiry beyond ceiling + one idle TTL…
    expect(lastExpiresAt).toBeLessThanOrEqual(start + ceiling + ttl);
    // …and by the end of the walk the cookie is both expired and refusing further renewal.
    expect(session.expiresAt).toBeLessThan(endNow);
    expect(shouldRenewSession(session, endNow)).toBe(false);
    expect(isSessionBeyondAbsoluteMaxAge(session, endNow)).toBe(true);
    expect(renewSessionIfActive(session)).toBe(session);
  });

  it("a patient session renewed at every opportunity is dead once past the patient ceiling", () => {
    const ttl = SESSION_SLIDING_TTL_SECONDS;
    const ceiling = SESSION_ABSOLUTE_MAX_AGE_SECONDS;
    const { session, renewals, lastExpiresAt, endNow, start } = driveRenewals("client", ttl, ceiling);

    expect(renewals).toBeGreaterThan(0);
    expect(session.issuedAt).toBe(start);
    expect(lastExpiresAt).toBeLessThanOrEqual(start + ceiling + ttl);
    expect(session.expiresAt).toBeLessThan(endNow);
    expect(shouldRenewSession(session, endNow)).toBe(false);
    expect(isSessionBeyondAbsoluteMaxAge(session, endNow)).toBe(true);
    expect(renewSessionIfActive(session)).toBe(session);
  });
});
