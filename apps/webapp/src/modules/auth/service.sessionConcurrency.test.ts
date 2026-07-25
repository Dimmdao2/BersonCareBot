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

function doctorUser(): SessionUser {
  return {
    userId: USER_ID,
    role: "doctor",
    displayName: "DEV Doctor",
    bindings: {},
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
    mocks.resolveRoleAsync.mockResolvedValue(role);

    const session = await runWithDbBootstrapPrincipal(
      { source: "service.sessionConcurrency.email-role" },
      () => getCurrentSession(),
    );

    expect(session?.user.role).toBe("admin");
    expect(mocks.getVerifiedEmailForUser).toHaveBeenCalledWith(USER_ID);
    expect(mocks.isVerifiedEmailGlobalAdminAsync).toHaveBeenCalledWith("dimmdao@gmail.com");
    expect(mocks.resolveRoleAsync).toHaveBeenCalledWith({
      phone: user.phone,
      telegramId: user.bindings?.telegramId,
      maxId: user.bindings?.maxId,
    });
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
    mocks.resolveRoleAsync.mockResolvedValue("admin");

    const session = await runWithDbBootstrapPrincipal(
      { source: "service.sessionConcurrency.independent-admin" },
      () => getCurrentSession(),
    );

    expect(session?.user.role).toBe("admin");
    expect(mocks.resolveRoleAsync).toHaveBeenCalledWith({
      phone: admin.phone,
      telegramId: admin.bindings.telegramId,
      maxId: undefined,
    });
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

  // D1 — session_version / logout-everywhere enforcement. `app.revoke_staff_sessions()` bumps
  // `staff_security_profiles.session_version`; every request re-reads it via
  // `pgUserByPhonePort.findByUserId()` and compares it against the version embedded in the signed
  // cookie at login. A mismatch must reject the cookie fail-closed (see service.ts ~L912).
  describe("staff security_version enforcement (revoke-everywhere)", () => {
    it("rejects a staff cookie whose embedded security version is behind the DB's after a revoke bumped it", async () => {
      const staleCookieUser = { ...doctorUser(), securityVersion: 1 };
      mocks.decodedSession = {
        user: staleCookieUser,
        issuedAt: 1,
        expiresAt: 9_999_999_999,
      } satisfies AppSession;
      // Simulates `app.revoke_staff_sessions()` having bumped session_version to 2 in the DB —
      // this cookie was issued before the revoke and must be treated as logged out.
      mocks.findByUserId.mockResolvedValue({ ...staleCookieUser, securityVersion: 2 });
      mocks.getVerifiedEmailForUser.mockResolvedValue(null);
      mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);

      const session = await runWithDbBootstrapPrincipal(
        { source: "service.sessionConcurrency.revoked-version" },
        () => getCurrentSession(),
      );

      expect(session).toBeNull();
    });

    it("accepts a staff cookie whose embedded security version matches the DB's current version", async () => {
      const currentUser = { ...doctorUser(), securityVersion: 2 };
      mocks.decodedSession = {
        user: currentUser,
        issuedAt: 1,
        expiresAt: 9_999_999_999,
      } satisfies AppSession;
      mocks.findByUserId.mockResolvedValue({ ...currentUser, securityVersion: 2 });
      mocks.getVerifiedEmailForUser.mockResolvedValue(null);
      mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);

      const session = await runWithDbBootstrapPrincipal(
        { source: "service.sessionConcurrency.current-version" },
        () => getCurrentSession(),
      );

      expect(session?.user.role).toBe("doctor");
      expect(session?.user.securityVersion).toBe(2);
    });

    it("accepts a legacy pre-versioning cookie against a never-revoked profile — both default to version 0, so no deploy-wide logout", async () => {
      const legacyUser = doctorUser(); // no `securityVersion` field, as pre-migration cookies are
      mocks.decodedSession = {
        user: legacyUser,
        issuedAt: 1,
        expiresAt: 9_999_999_999,
      } satisfies AppSession;
      // DB row also has never seen a revoke, so its session_version is still 0 (unset).
      mocks.findByUserId.mockResolvedValue(legacyUser);
      mocks.getVerifiedEmailForUser.mockResolvedValue(null);
      mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);

      const session = await runWithDbBootstrapPrincipal(
        { source: "service.sessionConcurrency.legacy-no-version" },
        () => getCurrentSession(),
      );

      expect(session?.user.role).toBe("doctor");
    });
  });
});
