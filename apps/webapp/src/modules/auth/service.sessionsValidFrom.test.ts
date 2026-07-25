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
  cookieValue: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bersoncare_webapp_session" && mocks.cookieValue
        ? { value: mocks.cookieValue }
        : undefined,
    set: vi.fn(),
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
    invalidateSessionsForSelf: vi.fn(),
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
import { getCurrentSession } from "./service";

const USER_ID = "33333333-3333-4333-8333-333333333333";

function user(role: UserRole): SessionUser {
  return { userId: USER_ID, role, displayName: "Test", bindings: {} };
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
    mocks.findByUserId.mockResolvedValue({ ...user("doctor"), sessionsValidFrom: now - 50 });
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    expect(await resolve()).toBeNull();
  });

  it("accepts a session issued AFTER sessions_valid_from", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, "doctor");
    mocks.findByUserId.mockResolvedValue({ ...user("doctor"), sessionsValidFrom: now - 50 });
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    const session = await resolve();
    expect(session?.user.role).toBe("doctor");
  });

  it("accepts a session issued exactly AT sessions_valid_from (not strictly earlier)", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now, "client");
    mocks.findByUserId.mockResolvedValue({ ...user("client"), sessionsValidFrom: now });

    const session = await resolve();
    expect(session?.user.role).toBe("client");
  });

  it("NULL cutoff (no sessionsValidFrom from the DB row) never rejects", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 1_000_000, "client");
    mocks.findByUserId.mockResolvedValue({ ...user("client") }); // no sessionsValidFrom field

    const session = await resolve();
    expect(session?.user.role).toBe("client");
  });

  it("staff absolute max age: accepted just inside the 7-day boundary", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS - 5), "doctor");
    mocks.findByUserId.mockResolvedValue({ ...user("doctor") });
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    const session = await resolve();
    expect(session?.user.role).toBe("doctor");
  });

  it("staff absolute max age: rejected just outside the 7-day boundary, even with a matching securityVersion and no revocation timestamp", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS + 5), "doctor");
    mocks.findByUserId.mockResolvedValue({ ...user("doctor") });
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    expect(await resolve()).toBeNull();
  });

  it("patient absolute max age: accepted just inside the 90-day boundary", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS - 5), "client");
    mocks.findByUserId.mockResolvedValue({ ...user("client") });

    const session = await resolve();
    expect(session?.user.role).toBe("client");
  });

  it("patient absolute max age: rejected just outside the 90-day boundary", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS + 5), "client");
    mocks.findByUserId.mockResolvedValue({ ...user("client") });

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
    mocks.findByUserId.mockResolvedValue({ ...user("doctor") });
    mocks.resolveRoleAsync.mockResolvedValue("doctor");

    expect(await resolve()).toBeNull();
  });
});
