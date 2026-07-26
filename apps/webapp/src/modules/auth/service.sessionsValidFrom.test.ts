import { beforeEach, describe, expect, it, vi } from "vitest";

// S2 remedy (2026-07-25, docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md): the chokepoint in
// getCurrentSessionWithPrincipalMode() that reads `platform_users.sessions_valid_from` and the
// absolute session-age cap, both beside the existing securityVersion check. Uses the REAL
// sessionCookie module (not mocked) so the real encode/decode + absolute-age arithmetic run.

const mocks = vi.hoisted(() => ({
  findByUserId: vi.fn(),
  getVerifiedEmailForUser: vi.fn(),
  isVerifiedEmailGlobalAdminAsync: vi.fn(),
  resolveRoleAsync: vi.fn(),
  stampDbPrincipalFromSession: vi.fn(),
  updateRole: vi.fn(),
  invalidateSessionsForSelf: vi.fn(),
  cookieSet: vi.fn(),
  cookieValue: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bersoncare_webapp_session" && mocks.cookieValue
        ? { value: mocks.cookieValue }
        : undefined,
    set: (...args: unknown[]) => mocks.cookieSet(...args),
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgresql://unit-test.invalid/bcb",
    NODE_ENV: "test",
    ALLOW_DEV_AUTH_BYPASS: false,
    SESSION_COOKIE_SECRET: "test-session-secret-min-16-chars",
  },
  isProduction: false,
}));

vi.mock("./envRole", () => ({
  isVerifiedEmailGlobalAdminAsync: (...args: unknown[]) => mocks.isVerifiedEmailGlobalAdminAsync(...args),
  resolveRoleAsync: (...args: unknown[]) => mocks.resolveRoleAsync(...args),
  isWhitelistedAsync: vi.fn(),
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorWebappEntrySecret: async () => "",
  getTelegramBotToken: async () => "",
  getMaxBotApiKey: async () => "",
}));

vi.mock("@/app-layer/principal/sessionPrincipal", () => ({
  stampDbPrincipalFromSession: (...args: unknown[]) => mocks.stampDbPrincipalFromSession(...args),
}));

vi.mock("@/infra/repos/pgUserByPhone", () => ({
  pgUserByPhonePort: {
    findByUserId: (...args: unknown[]) => mocks.findByUserId(...args),
    getVerifiedEmailForUser: (...args: unknown[]) => mocks.getVerifiedEmailForUser(...args),
    invalidateSessionsForSelf: (...args: unknown[]) => mocks.invalidateSessionsForSelf(...args),
  },
}));

vi.mock("@/infra/repos/pgUserProjection", () => ({
  pgUserProjectionPort: {
    updateRole: (...args: unknown[]) => mocks.updateRole(...args),
  },
}));

import { runWithDbBootstrapPrincipal } from "@bersoncare/db-principal";
import type { SessionUser, UserRole } from "@/shared/types/session";
import { encodeSessionCookie, SESSION_ABSOLUTE_MAX_AGE_SECONDS, SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS } from "./sessionCookie";
import { clearSession, getCurrentSession } from "./service";

const USER_ID = "33333333-3333-4333-8333-333333333333";

function user(role: UserRole): SessionUser {
  return { userId: USER_ID, role, displayName: "Test", bindings: {} };
}

/**
 * The shape the REAL `pgUserByPhonePort.findByUserId` returns: `sessionsValidFrom` is always
 * present — `null` when the DB column is SQL NULL (nothing has ever revoked this user), a number
 * when a cutoff exists. Its ABSENCE is the "could not be read" state and is covered by the
 * fail-closed cases below, so it must never be the accidental default of a fixture.
 */
function dbUser(role: UserRole, sessionsValidFrom: number | null = null): SessionUser {
  return { ...user(role), sessionsValidFrom };
}

function setCookie(issuedAt: number, role: UserRole, expiresAt = 9_999_999_999): void {
  mocks.cookieValue = encodeSessionCookie({ user: user(role), issuedAt, expiresAt });
}

describe("getCurrentSession — sessions_valid_from + absolute max age chokepoint (S2, 2026-07-25)", () => {
  beforeEach(() => {
    mocks.findByUserId.mockReset();
    mocks.getVerifiedEmailForUser.mockReset();
    mocks.isVerifiedEmailGlobalAdminAsync.mockReset();
    mocks.resolveRoleAsync.mockReset();
    mocks.stampDbPrincipalFromSession.mockReset();
    mocks.updateRole.mockReset();
    mocks.invalidateSessionsForSelf.mockReset();
    mocks.invalidateSessionsForSelf.mockResolvedValue(undefined);
    mocks.cookieSet.mockReset();
    mocks.cookieValue = undefined;
    mocks.getVerifiedEmailForUser.mockResolvedValue(null);
    mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);
  });

  async function resolve() {
    return runWithDbBootstrapPrincipal(
      { source: "service.sessionsValidFrom.test" },
      () => getCurrentSession(),
    );
  }

  it("rejects a session issued BEFORE sessions_valid_from (revoked after the cookie was minted)", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 100, "doctor");
    mocks.findByUserId.mockResolvedValue(dbUser("doctor", now - 50));
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    expect(await resolve()).toBeNull();
  });

  it("accepts a session issued AFTER sessions_valid_from", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, "doctor");
    mocks.findByUserId.mockResolvedValue(dbUser("doctor", now - 50));
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    const session = await resolve();
    expect(session?.user.role).toBe("doctor");
  });

  it("accepts a session issued exactly AT sessions_valid_from (not strictly earlier)", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now, "client");
    mocks.findByUserId.mockResolvedValue(dbUser("client", now));

    const session = await resolve();
    expect(session?.user.role).toBe("client");
  });

  it("NULL cutoff (row read fine, column is SQL NULL) never rejects, however old the cookie", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 1_000_000, "client");
    mocks.findByUserId.mockResolvedValue(dbUser("client", null));

    const session = await resolve();
    expect(session?.user.role).toBe("client");
  });

  // ---- fail closed: an UNREADABLE cutoff is never silently accepted ----------------------------

  it("FAIL CLOSED: a DB-backed patient whose row comes back WITHOUT sessionsValidFrom is rejected", async () => {
    // The pre-fix behaviour accepted this (undefined was read as 'no cutoff'). It is the shape a
    // drifted SELECT or a partially-populated row produces, and it must not resolve a session.
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, "client");
    mocks.findByUserId.mockResolvedValue(user("client")); // no sessionsValidFrom key at all

    expect(await resolve()).toBeNull();
  });

  it("FAIL CLOSED: a patient whose identity read THROWS is rejected (it used to fall back to the cookie user)", async () => {
    // resolveSessionUserAgainstDb() still falls back to the cookie user for patients, but strips
    // the cutoff — so this lands on the undefined branch above instead of being accepted.
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, "client");
    mocks.findByUserId.mockRejectedValue(new Error("session_user_sessions_valid_from_unparseable"));

    expect(await resolve()).toBeNull();
  });

  it("FAIL CLOSED: a cookie cannot smuggle its own sessionsValidFrom past the presence check", async () => {
    // Hand-mint a cookie carrying a forged-looking future cutoff, then make the DB read fail. If
    // encodeSessionCookie did not strip the field, the fallback cookie user would carry a value and
    // satisfy the "was it read?" test. Proves the strip, not just the comparison.
    const now = Math.floor(Date.now() / 1000);
    mocks.cookieValue = encodeSessionCookie({
      user: { ...user("client"), sessionsValidFrom: now - 10_000 },
      issuedAt: now - 10,
      expiresAt: 9_999_999_999,
    });
    mocks.findByUserId.mockRejectedValue(new Error("identity_read_failed"));

    expect(await resolve()).toBeNull();
  });

  it("a small DB-vs-app clock skew does not reject a cookie minted right after a stamp", async () => {
    // Every writer stamps sessions_valid_from and then immediately re-mints the cookie; a DB clock
    // a couple of seconds ahead must not turn that into an instant logout loop.
    const now = Math.floor(Date.now() / 1000);
    setCookie(now, "client");
    mocks.findByUserId.mockResolvedValue(dbUser("client", now + 2));

    const session = await resolve();
    expect(session?.user.role).toBe("client");
  });

  it("the skew allowance is bounded — a cutoff a minute after the cookie still revokes it", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 60, "client");
    mocks.findByUserId.mockResolvedValue(dbUser("client", now));

    expect(await resolve()).toBeNull();
  });

  it("staff absolute max age: accepted just inside the 7-day boundary", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS - 5), "doctor");
    mocks.findByUserId.mockResolvedValue(dbUser("doctor"));
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    const session = await resolve();
    expect(session?.user.role).toBe("doctor");
  });

  it("staff absolute max age: rejected just outside the 7-day boundary, even with a matching securityVersion and no revocation timestamp", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS + 5), "doctor");
    mocks.findByUserId.mockResolvedValue(dbUser("doctor"));
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    expect(await resolve()).toBeNull();
  });

  it("patient absolute max age: accepted just inside the 90-day boundary", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS - 5), "client");
    mocks.findByUserId.mockResolvedValue(dbUser("client"));

    const session = await resolve();
    expect(session?.user.role).toBe("client");
  });

  it("patient absolute max age: rejected just outside the 90-day boundary", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS + 5), "client");
    mocks.findByUserId.mockResolvedValue(dbUser("client"));

    expect(await resolve()).toBeNull();
  });

  it("the absolute-age cap uses the fresh DB role, not the cookie's stale role", async () => {
    // Cookie claims "client" (90-day bucket) but the DB now says "doctor" (7-day bucket) — a
    // session this old must be rejected under the SHORTER staff ceiling, not smuggled through on
    // the longer patient one via a stale cookie role.
    const now = Math.floor(Date.now() / 1000);
    const age = SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS + 5;
    expect(age).toBeLessThan(SESSION_ABSOLUTE_MAX_AGE_SECONDS);
    setCookie(now - age, "client");
    mocks.findByUserId.mockResolvedValue(dbUser("doctor"));
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    expect(await resolve()).toBeNull();
  });
});

describe("clearSession — logout actually revokes server-side, not just client-side (S2, 2026-07-25)", () => {
  beforeEach(() => {
    mocks.findByUserId.mockReset();
    mocks.getVerifiedEmailForUser.mockReset();
    mocks.resolveRoleAsync.mockReset();
    mocks.stampDbPrincipalFromSession.mockReset();
    mocks.invalidateSessionsForSelf.mockReset();
    mocks.invalidateSessionsForSelf.mockResolvedValue(undefined);
    mocks.cookieSet.mockReset();
    mocks.cookieValue = undefined;
  });

  async function logout() {
    return runWithDbBootstrapPrincipal({ source: "service.sessionsValidFrom.test:logout" }, () =>
      clearSession(),
    );
  }

  // Both /api/auth/logout GET and POST are thin wrappers over deps.auth.clearSession() (see
  // app/api/auth/logout/route.ts lines 17 and 25 and its own route.test.ts), so proving the stamp
  // here proves it for both verbs — that is the single-chokepoint shape, not a per-handler check.
  it("stamps sessions_valid_from for the signed-out user, so a copied cookie stops being accepted", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, "doctor");

    await logout();

    expect(mocks.invalidateSessionsForSelf).toHaveBeenCalledTimes(1);
    // …and the cookie is still cleared.
    expect(mocks.cookieSet).toHaveBeenCalled();
  });

  it("a cookie copied before logout is rejected afterwards (end to end through the chokepoint)", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 60, "doctor");
    const copiedCookie = mocks.cookieValue;

    // Logout stamps the DB. Model that stamp as the cutoff the next request will read.
    await logout();
    expect(mocks.invalidateSessionsForSelf).toHaveBeenCalledTimes(1);

    mocks.cookieValue = copiedCookie;
    mocks.findByUserId.mockResolvedValue(dbUser("doctor", now));
    mocks.resolveRoleAsync.mockResolvedValue("doctor");
    mocks.getVerifiedEmailForUser.mockResolvedValue(null);

    const replayed = await runWithDbBootstrapPrincipal(
      { source: "service.sessionsValidFrom.test:replay" },
      () => getCurrentSession(),
    );
    expect(replayed).toBeNull();
  });

  it("still clears the cookie when the DB stamp fails (logout must never leave the user signed in locally)", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, "client");
    mocks.invalidateSessionsForSelf.mockRejectedValue(new Error("db down"));

    await expect(logout()).resolves.toBeUndefined();
    expect(mocks.cookieSet).toHaveBeenCalled();
  });
});
