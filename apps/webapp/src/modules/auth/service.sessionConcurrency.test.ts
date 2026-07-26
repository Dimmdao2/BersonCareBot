import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decodedSession: null as unknown,
  findByUserId: vi.fn(),
  getVerifiedEmailForUser: vi.fn(),
  isVerifiedEmailGlobalAdminAsync: vi.fn(),
  resolveRoleAsync: vi.fn(),
  stampDbPrincipalFromSession: vi.fn(),
  updateRole: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bersoncare_webapp_session" ? { value: "signed-dev-session" } : undefined,
    set: vi.fn(),
  }),
}));

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgresql://unit-test.invalid/bcb",
    NODE_ENV: "development",
    ALLOW_DEV_AUTH_BYPASS: "true",
  },
  isProduction: false,
}));

vi.mock("./envRole", () => ({
  isVerifiedEmailGlobalAdminAsync: (...args: unknown[]) => mocks.isVerifiedEmailGlobalAdminAsync(...args),
  resolveRoleAsync: (...args: unknown[]) => mocks.resolveRoleAsync(...args),
  isWhitelistedAsync: vi.fn(),
}));

vi.mock("./sessionCookie", () => ({
  buildRenewedSessionCookieOptions: vi.fn(),
  buildSessionCookieOptions: vi.fn(),
  clearFreshLoginMarkerCookie: vi.fn(),
  decodeSessionCookie: () => mocks.decodedSession,
  encodeSessionCookie: vi.fn(),
  renewSessionIfActive: vi.fn(),
  sessionTtlSecondsForRole: () => 3_600,
  shouldRenewSession: vi.fn(),
  writeFreshLoginMarkerCookie: vi.fn(),
  // This file's fixtures use `issuedAt: 1` (1970) with a far-future `expiresAt`, which is exactly
  // what the real absolute-max-age cap would reject — that concern is covered separately in
  // service.sessionRevocation.test.ts, so it is neutralized here.
  isSessionBeyondAbsoluteMaxAge: () => false,
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorWebappEntrySecret: async () => "",
  getTelegramBotToken: async () => "",
  getMaxBotApiKey: async () => "",
}));

vi.mock("@/app-layer/principal/sessionPrincipal", () => ({
  stampDbPrincipalFromSession: (...args: unknown[]) =>
    mocks.stampDbPrincipalFromSession(...args),
}));

vi.mock("@/infra/repos/pgUserByPhone", () => ({
  pgUserByPhonePort: {
    // C-1 (2026-07-26): the real port ALWAYS returns a numeric `sessionEpoch` for a live DB row
    // (`platform_users.session_epoch` is `NOT NULL DEFAULT 1 CHECK (>= 1)`). Unlike the predecessor
    // `sessionsValidFrom` shim this file used to install here, there is no "read fine, no cutoff"
    // default to inject — every fixture below carries its own `sessionEpoch` explicitly (via the
    // `doctorUser(epoch)` factory), so this is a plain passthrough.
    findByUserId: (...args: unknown[]) => mocks.findByUserId(...args),
    getVerifiedEmailForUser: (...args: unknown[]) => mocks.getVerifiedEmailForUser(...args),
  },
}));

vi.mock("@/infra/repos/pgUserProjection", () => ({
  pgUserProjectionPort: {
    updateRole: (...args: unknown[]) => mocks.updateRole(...args),
  },
}));

import {
  enterWithDbStaffPrincipal,
  getCurrentDbPrincipal,
  runWithDbBootstrapPrincipal,
} from "@bersoncare/db-principal";
import type { AppSession, SessionUser, UserRole } from "@/shared/types/session";
import { getCurrentSession, getCurrentSessionForIdentitySelf } from "./service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

/**
 * `sessionEpoch` defaults to `1` — the value every live `platform_users` row starts at (C-1,
 * 2026-07-26) — so ordinary tests in this file that don't care about revocation get a cookie/DB-row
 * pair that matches at the chokepoint without having to restate the epoch at every call site. Pass
 * `null` explicitly to build the pre-cutover shape (no `sessionEpoch` key at all) — a default
 * *parameter* only substitutes on `undefined`, so `undefined` cannot be used as that signal here.
 */
function doctorUser(sessionEpoch: number | null = 1): SessionUser {
  return {
    userId: USER_ID,
    role: "doctor",
    displayName: "DEV Doctor",
    bindings: {},
    ...(sessionEpoch === null ? {} : { sessionEpoch }),
  };
}

describe("getCurrentSession identity-self concurrency", () => {
  beforeEach(() => {
    mocks.findByUserId.mockReset();
    mocks.getVerifiedEmailForUser.mockReset();
    mocks.isVerifiedEmailGlobalAdminAsync.mockReset();
    mocks.resolveRoleAsync.mockReset();
    mocks.stampDbPrincipalFromSession.mockReset();
    mocks.updateRole.mockReset();
    mocks.decodedSession = {
      user: doctorUser(),
      issuedAt: 1,
      expiresAt: 9_999_999_999,
      authSource: "dev_bypass",
    } satisfies AppSession;
  });

  it("keeps each concurrent dev-doctor identity read scoped while a sibling promotes to staff", async () => {
    let resolveFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      resolveFirstStarted = resolve;
    });
    let releaseFirstRead: (() => void) | undefined;
    const firstReadMayFinish = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    let resolveSecondStamped: (() => void) | undefined;
    const secondStamped = new Promise<void>((resolve) => {
      resolveSecondStamped = resolve;
    });
    let readCount = 0;

    mocks.findByUserId.mockImplementation(async (userId: string) => {
      readCount += 1;
      expect(userId).toBe(USER_ID);
      expect(getCurrentDbPrincipal()).toMatchObject({
        kind: "patient",
        platformUserId: USER_ID,
      });
      if (readCount === 1) {
        resolveFirstStarted?.();
        await firstReadMayFinish;
        expect(getCurrentDbPrincipal()).toMatchObject({
          kind: "patient",
          platformUserId: USER_ID,
        });
      }
      return doctorUser();
    });
    mocks.stampDbPrincipalFromSession.mockImplementation(async () => {
      enterWithDbStaffPrincipal({
        organizationId: ORGANIZATION_ID,
        platformUserId: USER_ID,
        source: "service.sessionConcurrency.test",
      });
      resolveSecondStamped?.();
    });

    const sessions = await runWithDbBootstrapPrincipal(
      { source: "service.sessionConcurrency.test" },
      async () => {
        const first = getCurrentSession();
        await firstStarted;
        const second = getCurrentSession();
        await secondStamped;
        releaseFirstRead?.();
        return Promise.all([first, second]);
      },
    );

    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session?.authSource === "dev_bypass")).toBe(true);
    expect(sessions.every((session) => session?.user.role === "doctor")).toBe(true);
    expect(mocks.findByUserId).toHaveBeenCalledTimes(2);
  });

  const IDENTITY_CASES: ReadonlyArray<[string, UserRole, Partial<SessionUser>]> = [
    ["client phone", "client", { phone: "+75550000001", bindings: {} }],
    ["client Telegram", "client", { bindings: { telegramId: "tg-client" } }],
    ["client MAX", "client", { bindings: { maxId: "max-client" } }],
    ["doctor phone", "doctor", { phone: "+75550000002", bindings: {} }],
    ["doctor Telegram", "doctor", { bindings: { telegramId: "tg-doctor" } }],
    ["doctor MAX", "doctor", { bindings: { maxId: "max-doctor" } }],
  ];

  it.each(IDENTITY_CASES)("elevates %s through a verified allowlisted email without persisting admin", async (_label, role, identity) => {
    const user = { ...doctorUser(), role, ...identity };
    mocks.decodedSession = {
      user,
      issuedAt: 1,
      expiresAt: 9_999_999_999,
    } satisfies AppSession;
    mocks.findByUserId.mockResolvedValue(user);
    mocks.getVerifiedEmailForUser.mockResolvedValue("dimmdao@gmail.com");
    mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(true);

    const session = await runWithDbBootstrapPrincipal(
      { source: "service.sessionConcurrency.email-role" },
      () => getCurrentSession(),
    );

    expect(session?.user.role).toBe("admin");
    expect(mocks.getVerifiedEmailForUser).toHaveBeenCalledWith(USER_ID);
    expect(mocks.isVerifiedEmailGlobalAdminAsync).toHaveBeenCalledWith("dimmdao@gmail.com");
    // C-4 (2026-07-26): the messenger/phone allowlists no longer confer role at all, so
    // getCurrentSessionWithPrincipalMode does not consult resolveRoleAsync anymore.
    expect(mocks.resolveRoleAsync).not.toHaveBeenCalled();
    expect(mocks.updateRole).not.toHaveBeenCalled();
  });

  it("fails closed when the verified-email lookup fails", async () => {
    const client = { ...doctorUser(), role: "client" as const, bindings: {} };
    mocks.decodedSession = {
      user: client,
      issuedAt: 1,
      expiresAt: 9_999_999_999,
    } satisfies AppSession;
    mocks.findByUserId.mockResolvedValue(client);
    mocks.getVerifiedEmailForUser.mockRejectedValue(new Error("permission denied"));

    const session = await runWithDbBootstrapPrincipal(
      { source: "service.sessionConcurrency.email-role-lookup-failure" },
      () => getCurrentSession(),
    );

    expect(session?.user.role).toBe("client");
    expect(mocks.isVerifiedEmailGlobalAdminAsync).toHaveBeenCalledWith(undefined);
    expect(mocks.updateRole).not.toHaveBeenCalled();
  });

  it.each(["allowlist removal", "policy database failure"])(
    "revokes a stale persisted owner-email admin cookie after %s",
    async (_reason) => {
      const legacyArtifactNowDemoted = {
        ...doctorUser(),
        role: "client" as const,
        bindings: {},
      };
      mocks.decodedSession = {
        // This is the pre-0233 persisted-admin cookie shape. The fresh DB identity
        // is the migration-demoted base role, which must win if email policy is false.
        user: { ...legacyArtifactNowDemoted, role: "admin" as const },
        issuedAt: 1,
        expiresAt: 9_999_999_999,
      } satisfies AppSession;
      mocks.findByUserId.mockResolvedValue(legacyArtifactNowDemoted);
      mocks.getVerifiedEmailForUser.mockResolvedValue("dimmdao@gmail.com");
      mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);

      const session = await runWithDbBootstrapPrincipal(
        { source: "service.sessionConcurrency.legacy-email-admin-revocation" },
        () => getCurrentSession(),
      );

      expect(session?.user.role).toBe("client");
      expect(mocks.isVerifiedEmailGlobalAdminAsync).toHaveBeenCalledWith("dimmdao@gmail.com");
      expect(mocks.resolveRoleAsync).not.toHaveBeenCalled();
      expect(mocks.updateRole).not.toHaveBeenCalled();
    },
  );

  it("keeps a legitimate non-email global admin base role when email policy is negative", async () => {
    const admin = {
      ...doctorUser(),
      role: "admin" as const,
      phone: "+75550000003",
      bindings: { telegramId: "tg-independent-admin" },
    };
    mocks.decodedSession = {
      user: admin,
      issuedAt: 1,
      expiresAt: 9_999_999_999,
    } satisfies AppSession;
    mocks.findByUserId.mockResolvedValue(admin);
    mocks.getVerifiedEmailForUser.mockResolvedValue("dimmdao@gmail.com");
    mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);

    const session = await runWithDbBootstrapPrincipal(
      { source: "service.sessionConcurrency.independent-admin" },
      () => getCurrentSession(),
    );

    // C-4 (2026-07-26): this admin role comes straight from the fresh DB read
    // (resolveSessionIdentityAgainstDb), not from any messenger/phone allowlist resolution.
    expect(session?.user.role).toBe("admin");
    expect(mocks.resolveRoleAsync).not.toHaveBeenCalled();
    expect(mocks.updateRole).not.toHaveBeenCalled();
  });

  it("resolves a verified-email global admin without organization principal stamping for identity-self paths", async () => {
    const user = { ...doctorUser(), role: "client" as const, bindings: {} };
    mocks.decodedSession = {
      user,
      issuedAt: 1,
      expiresAt: 9_999_999_999,
    } satisfies AppSession;
    mocks.findByUserId.mockResolvedValue(user);
    mocks.getVerifiedEmailForUser.mockResolvedValue("dimmdao@gmail.com");
    mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(true);
    mocks.resolveRoleAsync.mockResolvedValue("client");

    const session = await runWithDbBootstrapPrincipal(
      { source: "service.sessionConcurrency.identity-self" },
      () => getCurrentSessionForIdentitySelf(),
    );

    expect(session?.user.role).toBe("admin");
    expect(mocks.stampDbPrincipalFromSession).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });

  // C-1 (2026-07-26) — session_epoch / logout-everywhere enforcement. Any revocation event (logout,
  // password reset, "sign out everywhere", staff MFA revoke, archive) bumps `platform_users.
  // session_epoch`; every request re-reads it via `pgUserByPhonePort.findByUserId()` and compares it
  // against the epoch embedded in the signed cookie at login, for EQUALITY. A mismatch must reject
  // the cookie fail-closed (see service.ts's chokepoint in getCurrentSessionWithPrincipalMode()).
  // This replaces the old `securityVersion` mechanism, which was staff-only and defaulted absent
  // values on both sides to 0 — a default that made a revoke a no-op for anyone without a
  // `staff_security_profiles` row. `session_epoch` has no such default (full end-to-end proof,
  // including the archived-identity and absolute-age cases, lives in
  // service.sessionRevocation.test.ts; these three stay local to this file because they exercise it
  // through the same identity-self concurrency mocks/wrapper as the rest of the suite above).
  describe("session_epoch enforcement (revoke-everywhere)", () => {
    it("rejects a staff cookie whose embedded session_epoch is behind the DB's after a revoke bumped it", async () => {
      const staleCookieUser = doctorUser(1);
      mocks.decodedSession = {
        user: staleCookieUser,
        issuedAt: 1,
        expiresAt: 9_999_999_999,
      } satisfies AppSession;
      // Simulates a revocation event having bumped session_epoch to 2 in the DB — this cookie was
      // minted before that and must be treated as logged out.
      mocks.findByUserId.mockResolvedValue(doctorUser(2));
      mocks.getVerifiedEmailForUser.mockResolvedValue(null);
      mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);

      const session = await runWithDbBootstrapPrincipal(
        { source: "service.sessionConcurrency.revoked-epoch" },
        () => getCurrentSession(),
      );

      expect(session).toBeNull();
    });

    it("accepts a staff cookie whose embedded session_epoch matches the DB's current epoch", async () => {
      const currentUser = doctorUser(2);
      mocks.decodedSession = {
        user: currentUser,
        issuedAt: 1,
        expiresAt: 9_999_999_999,
      } satisfies AppSession;
      mocks.findByUserId.mockResolvedValue(doctorUser(2));
      mocks.getVerifiedEmailForUser.mockResolvedValue(null);
      mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);

      const session = await runWithDbBootstrapPrincipal(
        { source: "service.sessionConcurrency.current-epoch" },
        () => getCurrentSession(),
      );

      expect(session?.user.role).toBe("doctor");
      expect(session?.user.sessionEpoch).toBe(2);
    });

    it("CUTOVER: rejects a legacy pre-epoch cookie even against a matching, never-revoked profile", async () => {
      // This is the deliberate behavior flip from the predecessor mechanism (see the describe-level
      // comment above): a cookie minted before this deploy carries no `sessionEpoch` at all, and
      // `platform_users.session_epoch` is `NOT NULL DEFAULT 1` — there is no shared "unset" value the
      // two sides could coincidentally agree on, so every pre-cutover session dies exactly once.
      const legacyUser = doctorUser(null); // no `sessionEpoch` field, as pre-cutover cookies are
      mocks.decodedSession = {
        user: legacyUser,
        issuedAt: 1,
        expiresAt: 9_999_999_999,
      } satisfies AppSession;
      // The DB row was never revoked, so it sits at its default epoch of 1 — still not equal to the
      // cookie's missing value.
      mocks.findByUserId.mockResolvedValue(doctorUser(1));
      mocks.getVerifiedEmailForUser.mockResolvedValue(null);
      mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);

      const session = await runWithDbBootstrapPrincipal(
        { source: "service.sessionConcurrency.legacy-no-epoch" },
        () => getCurrentSession(),
      );

      expect(session).toBeNull();
    });
  });
});
