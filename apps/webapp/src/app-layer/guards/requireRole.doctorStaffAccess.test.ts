import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";
import type { AppSession } from "@/shared/types/session";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const getCurrentSessionForIdentitySelfMock = vi.hoisted(() => vi.fn());
const resolveOrganizationForUserMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
);

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
  getCurrentSessionForIdentitySelf: getCurrentSessionForIdentitySelfMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock } }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getServerRuntimeBoolMock = vi.hoisted(() => vi.fn().mockResolvedValue(false));
vi.mock("@/modules/system-settings/configAdapter", () => ({
  getServerRuntimeBool: getServerRuntimeBoolMock,
}));

import { buildOwnHubUrlWithAccessDeniedToast } from "@/shared/lib/appAccessDeniedToast";
import {
  getOptionalPatientSession,
  requireDoctorAccess,
  requireOrganizationManagementContext,
  requirePatientAccess,
  requireStaffAccountPage,
  requireStaffPersonalInstallPage,
  requireStaffWebPushSelfApiSession,
} from "./requireRole";

function session(role: AppSession["user"]["role"]): AppSession {
  return {
    user: {
      userId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      role,
      displayName: "User",
      bindings: {},
    },
    issuedAt: 1,
    expiresAt: 9e9,
  };
}

beforeEach(() => {
  getCurrentSessionMock.mockReset();
  getCurrentSessionForIdentitySelfMock.mockReset();
  resolveOrganizationForUserMock.mockReset();
  resolveOrganizationForUserMock.mockResolvedValue({ ok: false, reason: "no_active_membership" });
  redirectMock.mockReset();
  getServerRuntimeBoolMock.mockReset().mockResolvedValue(false);
});

describe("requireStaffAccountPage", () => {
  it("allows a staff account without resolving organization membership", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);

    await expect(requireStaffAccountPage()).resolves.toBe(doctor);
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("lets an explicit platform operator reach its own account page (2FA off / already verified)", async () => {
    // Owner ruling 2026-07-26: the global admin manages its own credentials (password reset lives
    // on the security tab) here, the same as a doctor account. Before this fix,
    // resolveLaunchCapabilities gave admin+adminMode EXACTLY {platform.operations} — never
    // account.self — and requireStaffAccountPage bounced platform.operations holders to
    // system-health unconditionally, locking the platform operator out of its own account.
    getServerRuntimeBoolMock.mockResolvedValue(false);
    const admin = { ...session("admin"), adminMode: true };
    getCurrentSessionMock.mockResolvedValueOnce(admin);

    await expect(requireStaffAccountPage()).resolves.toBe(admin);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("also reaches the account page once a global admin has completed TOTP enrollment (factor_verified)", async () => {
    getServerRuntimeBoolMock.mockResolvedValue(true);
    const admin = {
      ...session("admin"),
      adminMode: true,
      staffSecurity: { assurance: "factor_verified" as const },
    };
    getCurrentSessionMock.mockResolvedValueOnce(admin);

    await expect(requireStaffAccountPage()).resolves.toBe(admin);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("lets a 2FA-restricted global admin reach the account/security tab too (no enrollment loop)", async () => {
    // Regression for the audited redirect loop (2026-07-25, owner ruling 2026-07-24 fix): before
    // that fix, an unconditional platform.operations bounce to system-health — which itself
    // bounces a restricted session back to /app — was an infinite loop with no way to ever reach
    // TOTP enrollment. Post owner-ruling-2026-07-26, account.self admits this session directly and
    // the restricted flag no longer needs to matter for a global admin at all; kept as an explicit
    // case so a future capability change that ever narrows account.self here is still caught.
    getServerRuntimeBoolMock.mockResolvedValue(true);
    const admin = { ...session("admin"), adminMode: true };
    getCurrentSessionMock.mockResolvedValueOnce(admin);

    await expect(requireStaffAccountPage()).resolves.toBe(admin);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("denies a patient account", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("client"));
    const target = buildOwnHubUrlWithAccessDeniedToast("client");
    await expect(requireStaffAccountPage()).rejects.toThrow(`redirect:${target}`);
  });
});

describe("global-admin personal PWA exception", () => {
  it("allows only the install page without resolving organization membership", async () => {
    const admin = {
      ...session("admin"),
      adminMode: true,
      user: { ...session("admin").user, userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    };
    getCurrentSessionForIdentitySelfMock.mockResolvedValueOnce(admin);

    await expect(requireStaffPersonalInstallPage()).resolves.toBe(admin);
    expect(getCurrentSessionForIdentitySelfMock).toHaveBeenCalledTimes(1);
    expect(getCurrentSessionMock).not.toHaveBeenCalled();
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipal()).toMatchObject({ kind: "patient", platformUserId: admin.user.userId });
  });

  it("allows global admin web-push self-service without membership resolution", async () => {
    const admin = {
      ...session("admin"),
      adminMode: true,
      user: { ...session("admin").user, userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    };
    getCurrentSessionForIdentitySelfMock.mockResolvedValueOnce(admin);

    await expect(requireStaffWebPushSelfApiSession()).resolves.toMatchObject({ ok: true, session: admin });
    expect(getCurrentSessionForIdentitySelfMock).toHaveBeenCalledTimes(1);
    expect(getCurrentSessionMock).not.toHaveBeenCalled();
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "patient",
      platformUserId: admin.user.userId,
    });
  });
});

describe("requireOrganizationManagementContext", () => {
  it("sends staff without an organization membership to the personal account", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));

    await expect(requireOrganizationManagementContext()).rejects.toThrow("redirect:/app/account");
  });

  it("keeps explicit global admin out of organization management", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({ ...session("admin"), adminMode: true });

    await expect(requireOrganizationManagementContext()).rejects.toThrow(
      "redirect:/app/admin/system-health",
    );
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("allows an owner without a specialist binding", async () => {
    const owner = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(owner);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: "org-1",
        platformUserId: owner.user.userId,
        role: "owner",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
        canAccessClinicalWorkspace: false,
      },
    });

    await expect(requireOrganizationManagementContext()).resolves.toMatchObject({
      organizationId: "org-1",
      membershipRole: "owner",
      specialistId: null,
      canManageOrganization: true,
    });
  });

  it("returns a plain specialist to the clinical workspace", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: "org-1",
        platformUserId: doctor.user.userId,
        role: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
        canAccessClinicalWorkspace: true,
      },
    });

    await expect(requireOrganizationManagementContext()).rejects.toThrow("redirect:/app/doctor");
  });
});

describe("requireDoctorAccess", () => {
  it("redirects client to patient hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("client"));
    const target = buildOwnHubUrlWithAccessDeniedToast("client");
    await expect(requireDoctorAccess()).rejects.toThrow(`redirect:${target}`);
    expect(redirectMock).toHaveBeenCalledWith(target);
  });

  it("returns session for doctor", async () => {
    const doc = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doc);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: "org-1",
        platformUserId: doc.user.userId,
        role: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });
    await expect(requireDoctorAccess()).resolves.toBe(doc);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects a bindingless owner/admin to the management destination", async () => {
    const admin = session("admin");
    getCurrentSessionMock.mockResolvedValueOnce(admin);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: "org-1",
        platformUserId: admin.user.userId,
        role: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
      },
    });
    await expect(requireDoctorAccess()).rejects.toThrow("redirect:/app/settings?tab=organization");
  });

  it("redirects to /app when no session", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    await expect(requireDoctorAccess()).rejects.toThrow("redirect:/app");
    expect(redirectMock).toHaveBeenCalledWith("/app");
  });
});

describe("requirePatientAccess", () => {
  it("redirects doctor to doctor hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));
    const target = buildOwnHubUrlWithAccessDeniedToast("doctor");
    await expect(requirePatientAccess()).rejects.toThrow(`redirect:${target}`);
    expect(redirectMock).toHaveBeenCalledWith(target);
  });

  it("redirects admin to doctor hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("admin"));
    const target = buildOwnHubUrlWithAccessDeniedToast("admin");
    await expect(requirePatientAccess()).rejects.toThrow(`redirect:${target}`);
    expect(redirectMock).toHaveBeenCalledWith(target);
  });

  it("returns session for client", async () => {
    const client = session("client");
    getCurrentSessionMock.mockResolvedValueOnce(client);
    await expect(requirePatientAccess()).resolves.toBe(client);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("getOptionalPatientSession", () => {
  it("returns null when no session", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    await expect(getOptionalPatientSession()).resolves.toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects doctor to doctor hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));
    const target = buildOwnHubUrlWithAccessDeniedToast("doctor");
    await expect(getOptionalPatientSession()).rejects.toThrow(`redirect:${target}`);
    expect(redirectMock).toHaveBeenCalledWith(target);
  });

  it("returns session for client", async () => {
    const client = session("client");
    getCurrentSessionMock.mockResolvedValueOnce(client);
    await expect(getOptionalPatientSession()).resolves.toBe(client);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
