import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decodedSession: null as unknown,
  findByUserId: vi.fn(),
  getVerifiedEmailForUser: vi.fn(),
  isVerifiedEmailGlobalAdminAsync: vi.fn(),
  stampDbPrincipalFromSession: vi.fn(),
  getWebPushVapidPublicKeyOnly: vi.fn(),
  getWebPushVapidKeyPair: vi.fn(),
  hasAnyForUserId: vi.fn(),
  getPreferences: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "bersoncare_webapp_session" ? { value: "signed-session" } : undefined),
    set: vi.fn(),
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgresql://unit-test.invalid/bcb",
    NODE_ENV: "test",
    ALLOW_DEV_AUTH_BYPASS: "false",
  },
  isProduction: false,
}));

vi.mock("@/modules/auth/sessionCookie", () => ({
  buildRenewedSessionCookieOptions: vi.fn(),
  buildSessionCookieOptions: vi.fn(),
  clearFreshLoginMarkerCookie: vi.fn(),
  decodeSessionCookie: () => mocks.decodedSession,
  encodeSessionCookie: vi.fn(),
  // C-1 (2026-07-26): the absolute-age cap the chokepoint enforces after the epoch comparison
  // (service.ts, getCurrentSessionWithPrincipalMode). Same stub as
  // service.sessionConcurrency.test.ts — these fixtures are never beyond the cap.
  isSessionBeyondAbsoluteMaxAge: () => false,
  renewSessionIfActive: vi.fn(),
  sessionTtlSecondsForRole: () => 3_600,
  shouldRenewSession: vi.fn(),
  writeFreshLoginMarkerCookie: vi.fn(),
}));

vi.mock("@/modules/auth/envRole", () => ({
  isVerifiedEmailGlobalAdminAsync: (...args: unknown[]) => mocks.isVerifiedEmailGlobalAdminAsync(...args),
  resolveRoleAsync: vi.fn(),
  isWhitelistedAsync: vi.fn(),
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorWebappEntrySecret: async () => "",
  getTelegramBotToken: async () => "",
  getMaxBotApiKey: async () => "",
}));

vi.mock("@/infra/repos/pgUserByPhone", () => ({
  pgUserByPhonePort: {
    findByUserId: (...args: unknown[]) => mocks.findByUserId(...args),
    getVerifiedEmailForUser: (...args: unknown[]) => mocks.getVerifiedEmailForUser(...args),
  },
}));

// This is the organization-resolution chokepoint used by normal sessions. The contract calls the
// actual auth service and guards, then asserts the identity-self branch never reaches this port.
vi.mock("@/app-layer/principal/sessionPrincipal", () => ({
  stampDbPrincipalFromSession: (...args: unknown[]) => mocks.stampDbPrincipalFromSession(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: {
      getWebPushVapidPublicKeyOnly: (...args: unknown[]) => mocks.getWebPushVapidPublicKeyOnly(...args),
      getWebPushVapidKeyPair: (...args: unknown[]) => mocks.getWebPushVapidKeyPair(...args),
    },
    webPushSubscriptions: {
      hasAnyForUserId: (...args: unknown[]) => mocks.hasAnyForUserId(...args),
    },
    channelPreferencesPort: {
      getPreferences: (...args: unknown[]) => mocks.getPreferences(...args),
    },
  }),
}));

import { getCurrentDbPrincipal, runWithDbBootstrapPrincipal } from "@bersoncare/db-principal";
import type { AppSession, SessionUser, UserRole } from "@/shared/types/session";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import DoctorInstallPage from "@/app/app/(staff-personal)/doctor/install/page";
import { GET as getStaffWebPushStatus } from "./status/route";

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

// C-1 (2026-07-26, service.ts resolveSessionIdentityAgainstDb): the session chokepoint now
// compares the cookie's `sessionEpoch` for equality against a fresh `platform_users` read, and
// treats a row without a numeric epoch as unreadable (fail closed). The real
// `pgUserByPhonePort.findByUserId` always returns one (`session_epoch NOT NULL DEFAULT 1`), so
// every fixture here carries the matching value — same pattern as
// `service.sessionConcurrency.test.ts`'s `doctorUser()`.
function sessionUser(role: UserRole): SessionUser {
  return { userId: USER_ID, role, displayName: "Owner", bindings: {}, sessionEpoch: 1 };
}

function setSignedSession(role: UserRole, verifiedEmailAdmin: boolean): void {
  const user = sessionUser(role);
  mocks.decodedSession = {
    user,
    issuedAt: 1,
    expiresAt: 9_999_999_999,
  } satisfies AppSession;
  mocks.findByUserId.mockResolvedValue(user);
  mocks.getVerifiedEmailForUser.mockResolvedValue(verifiedEmailAdmin ? "dimmdao@gmail.com" : undefined);
  mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(verifiedEmailAdmin);
}

describe("staff personal PWA identity-self contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stampDbPrincipalFromSession.mockResolvedValue(undefined);
    mocks.getWebPushVapidPublicKeyOnly.mockResolvedValue("public-vapid-key");
    mocks.getWebPushVapidKeyPair.mockImplementation(() => {
      throw new Error("private VAPID accessor must not be called");
    });
    mocks.hasAnyForUserId.mockResolvedValue(false);
    mocks.getPreferences.mockResolvedValue([]);
  });

  it("resolves a verified-email global admin through identity-self and reads only the public VAPID key", async () => {
    setSignedSession("client", true);
    let principalAtVapidRead: unknown;
    mocks.getWebPushVapidPublicKeyOnly.mockImplementation(async () => {
      principalAtVapidRead = getCurrentDbPrincipal();
      return "public-vapid-key";
    });

    const response = await runWithDbBootstrapPrincipal(
      { source: "staffPersonalBoundary.contract.status" },
      () => getStaffWebPushStatus(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      vapidConfigured: true,
      publicKey: "public-vapid-key",
    });
    expect(principalAtVapidRead).toMatchObject({ kind: "patient", platformUserId: USER_ID });
    expect(mocks.stampDbPrincipalFromSession).not.toHaveBeenCalled();
    expect(mocks.getWebPushVapidPublicKeyOnly).toHaveBeenCalledTimes(1);
    expect(mocks.getWebPushVapidKeyPair).not.toHaveBeenCalled();
  });

  it("denies a patient session before any VAPID accessor is called", async () => {
    setSignedSession("client", false);

    const response = await runWithDbBootstrapPrincipal(
      { source: "staffPersonalBoundary.contract.patient" },
      () => getStaffWebPushStatus(),
    );

    expect(response.status).toBe(403);
    expect(mocks.getWebPushVapidPublicKeyOnly).not.toHaveBeenCalled();
    expect(mocks.getWebPushVapidKeyPair).not.toHaveBeenCalled();
  });

  it("keeps an ordinary doctor on the account install flow", async () => {
    setSignedSession("doctor", false);

    await expect(
      runWithDbBootstrapPrincipal(
        { source: "staffPersonalBoundary.contract.doctor-install" },
        () => DoctorInstallPage(),
      ),
    ).rejects.toThrow("redirect:/app/account?tab=install");
    expect(mocks.stampDbPrincipalFromSession).not.toHaveBeenCalled();
  });

  it("now admits the global admin to requireDoctorApiSession too — it backs account-self routes only", async () => {
    // Owner ruling 2026-07-26 (fix for the /app/account lockout): admin+adminMode now resolves
    // account.self alongside platform.operations (workspaceCapabilities.ts), so it clears
    // requireDoctorApiSession's `hasLaunchCapability(capabilities, "account.self")` check the same
    // way a doctor session already did. This is not a widening of the narrow identity-self
    // exception above (StaffWebPushBootstrap/install) — requireDoctorApiSession is a SEPARATE guard
    // that today only backs /api/doctor/account/email and /api/doctor/account/timezone, both scoped
    // to session.user.userId. It still resolves no organization membership for authorization, so
    // this stays account-self, never a grant onto clinical/org-scoped doctor API surfaces (those
    // route through requireDoctorWorkspaceApiContext, which independently requires a resolved
    // clinical.workspace membership — untouched by this fix).
    setSignedSession("client", true);

    const gate = await runWithDbBootstrapPrincipal(
      { source: "staffPersonalBoundary.contract.general-doctor-api" },
      () => requireDoctorApiSession(),
    );

    expect(gate.ok).toBe(true);
  });
});
