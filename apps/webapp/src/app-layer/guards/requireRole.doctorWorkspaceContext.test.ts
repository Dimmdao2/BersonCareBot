import { beforeEach, describe, expect, it, vi } from "vitest";
import { enterWithDbBootstrapPrincipal, getCurrentDbPrincipal } from "@bersoncare/db-principal";
import type { AppSession } from "@/shared/types/session";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const resolveOrganizationForUserMock = vi.hoisted(() => vi.fn());
const ORG_1 = "11111111-1111-4111-8111-111111111111";
const ORG_2 = "22222222-2222-4222-8222-222222222222";
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
);

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    organizationMembership: {
      resolveOrganizationForUser: resolveOrganizationForUserMock,
    },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

import {
  requireAdminWorkspaceApiContext,
  requireClinicManagementApiContext,
  requireDoctorApiSession,
  requireDoctorWorkspaceApiContext,
  requireDoctorWorkspaceContext,
  requireStaffSecurityApiSession,
} from "./requireRole";
import { resolveLaunchCapabilities } from "./workspaceCapabilities";

function session(role: AppSession["user"]["role"]): AppSession {
  return {
    user: {
      userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      role,
      displayName: "User",
      bindings: {},
    },
    issuedAt: 1,
    expiresAt: 9e9,
  };
}

beforeEach(() => {
  enterWithDbBootstrapPrincipal({ source: "test-reset" });
  getCurrentSessionMock.mockReset();
  resolveOrganizationForUserMock.mockReset();
  redirectMock.mockReset();
});

describe("U1 launch capability mapping", () => {
  it("maps only trusted owner/admin binding facts to management and clinical workspaces", () => {
    expect(
      Array.from(
        resolveLaunchCapabilities({
          sessionRole: "doctor",
          membershipRole: "owner",
          specialistId: null,
        }),
      ),
    ).toEqual(["account.self", "organization.management"]);
    expect(
      resolveLaunchCapabilities({
        sessionRole: "doctor",
        membershipRole: "owner",
        specialistId: "specialist-1",
      }),
    ).toEqual(new Set(["account.self", "organization.management", "clinical.workspace"]));
    expect(
      resolveLaunchCapabilities({
        sessionRole: "doctor",
        membershipRole: "assistant",
        specialistId: null,
      }),
    ).toEqual(new Set(["account.self"]));
    expect(
      resolveLaunchCapabilities({
        sessionRole: "admin",
        adminMode: true,
        membershipRole: "doctor",
        specialistId: "specialist-1",
      }),
    ).toEqual(new Set(["platform.operations"]));
  });
});

describe("requireDoctorWorkspaceApiContext", () => {
  it("returns unauthorized when session is missing", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it("returns unauthorized when role cannot access doctor workspace", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("client"));

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it("keeps a new specialist signup in account setup until the protected factor is complete", async () => {
    const pending = {
      ...session("doctor"),
      staffSecurity: { assurance: "pending_enrollment" as const },
    };
    getCurrentSessionMock.mockResolvedValueOnce(pending);

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it.each(["recovery", "recovery_confirmation"] as const)(
    "denies the clinical workspace to a %s session",
    async (assurance) => {
      getCurrentSessionMock.mockResolvedValueOnce({
        ...session("doctor"),
        staffSecurity: { assurance },
      });

      const gate = await requireDoctorWorkspaceApiContext();

      expect(gate.ok).toBe(false);
      if (gate.ok) return;
      expect(gate.response.status).toBe(403);
      expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    },
  );

  it("returns resolved organization membership context", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: ORG_1,
        platformUserId: doctor.user.userId,
        role: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
        canAccessClinicalWorkspace: true,
      },
    });

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate).toMatchObject({
      ok: true,
      ctx: {
        session: doctor,
        organizationId: ORG_1,
        membershipId: "membership-1",
        membershipRole: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
        canAccessClinicalWorkspace: true,
        capabilities: expect.arrayContaining(["clinical.workspace", "account.self"]),
      },
    });
    expect(resolveOrganizationForUserMock).toHaveBeenCalledWith({
      platformUserId: doctor.user.userId,
    });
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "staff",
      organizationId: ORG_1,
      platformUserId: doctor.user.userId,
    });
  });

  it("allows an admin platform session to enter doctor workspace through a doctor membership", async () => {
    const admin = { ...session("admin"), adminMode: false };
    getCurrentSessionMock.mockResolvedValueOnce(admin);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-doctor",
        organizationId: ORG_1,
        platformUserId: admin.user.userId,
        role: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.ctx.session.user.role).toBe("admin");
    expect(gate.ctx.membershipRole).toBe("doctor");
    expect(gate.ctx.specialistId).toBe("specialist-1");
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "staff",
      organizationId: ORG_1,
      platformUserId: admin.user.userId,
    });
  });

  it("fails closed for a management-only organization admin", async () => {
    const admin = { ...session("admin"), adminMode: false };
    getCurrentSessionMock.mockResolvedValueOnce(admin);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-admin",
        organizationId: ORG_1,
        platformUserId: admin.user.userId,
        role: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
        canAccessClinicalWorkspace: false,
      },
    });

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    await expect(gate.response.json()).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(getCurrentDbPrincipal()).toMatchObject({ kind: "bootstrap" });
  });

  it("denies global admin in admin mode from clinical APIs", async () => {
    const admin = { ...session("admin"), adminMode: true };
    getCurrentSessionMock.mockResolvedValueOnce(admin);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-admin",
        organizationId: ORG_1,
        platformUserId: admin.user.userId,
        role: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
        canAccessClinicalWorkspace: false,
      },
    });

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    expect(getCurrentDbPrincipal()).toMatchObject({ kind: "bootstrap" });
  });

  it("maps missing membership to forbidden response", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));
    resolveOrganizationForUserMock.mockResolvedValueOnce({ ok: false, reason: "no_active_membership" });

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    await expect(gate.response.json()).resolves.toMatchObject({
      ok: false,
      error: "doctor_workspace_membership_required",
    });
  });

  it("propagates duplicate staff memberships as a data-integrity error", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("admin"));
    resolveOrganizationForUserMock.mockRejectedValueOnce(new Error("multiple_active_staff_memberships"));

    await expect(requireDoctorWorkspaceApiContext()).rejects.toThrow("multiple_active_staff_memberships");
  });
});

describe("requireDoctorApiSession", () => {
  it("distinguishes an authenticated non-staff actor from a missing session", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("client"));

    const gate = await requireDoctorApiSession();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    await expect(gate.response.json()).resolves.toMatchObject({ error: "forbidden" });
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("does not block when best-effort staff principal resolution fails", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);
    resolveOrganizationForUserMock.mockResolvedValueOnce({ ok: false, reason: "no_active_membership" });

    const gate = await requireDoctorApiSession();

    expect(gate).toEqual({ ok: true, session: doctor });
    expect(getCurrentDbPrincipal()).toMatchObject({ kind: "bootstrap" });
  });

  it.each(["pending_enrollment", "recovery", "recovery_confirmation"] as const)(
    "denies unrelated account and doctor APIs to a %s session",
    async (assurance) => {
      getCurrentSessionMock.mockResolvedValueOnce({
        ...session("doctor"),
        staffSecurity: { assurance },
      });

      const gate = await requireDoctorApiSession();

      expect(gate.ok).toBe(false);
      if (gate.ok) return;
      expect(gate.response.status).toBe(403);
      await expect(gate.response.json()).resolves.toMatchObject({ error: "security_setup_required" });
      expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    },
  );
});

describe("requireStaffSecurityApiSession", () => {
  it("allows recovery only into identity-self security APIs", async () => {
    const recovery = {
      ...session("doctor"),
      staffSecurity: { assurance: "recovery" as const },
    };
    getCurrentSessionMock.mockResolvedValueOnce(recovery);

    const gate = await requireStaffSecurityApiSession();

    expect(gate).toEqual({ ok: true, session: recovery });
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "patient",
      platformUserId: recovery.user.userId,
    });
  });
});

describe("requireAdminWorkspaceApiContext", () => {
  it("returns unauthorized when session is missing", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);

    const gate = await requireAdminWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it("returns forbidden when no organization membership is resolved", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({ ...session("admin"), adminMode: false });
    resolveOrganizationForUserMock.mockResolvedValueOnce({ ok: false, reason: "no_active_membership" });

    const gate = await requireAdminWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    expect(resolveOrganizationForUserMock).toHaveBeenCalledTimes(1);
  });

  it("returns a resolved organization-management context for a staff admin", async () => {
    const admin = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(admin);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: ORG_1,
        platformUserId: admin.user.userId,
        role: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
        canAccessClinicalWorkspace: false,
      },
    });

    const gate = await requireAdminWorkspaceApiContext();

    expect(gate).toMatchObject({
      ok: true,
      ctx: {
        session: admin,
        organizationId: ORG_1,
        membershipId: "membership-1",
        membershipRole: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
        canAccessClinicalWorkspace: false,
        capabilities: expect.arrayContaining(["organization.management"]),
      },
    });
    expect(resolveOrganizationForUserMock).toHaveBeenCalledWith({
      platformUserId: admin.user.userId,
    });
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "staff",
      organizationId: ORG_1,
      platformUserId: admin.user.userId,
    });
  });

  it("does not grant repair to an explicit platform admin", async () => {
    const admin = { ...session("admin"), adminMode: true };
    getCurrentSessionMock.mockResolvedValueOnce(admin);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: ORG_1,
        platformUserId: admin.user.userId,
        role: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
      },
    });

    const gate = await requireAdminWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    expect(resolveOrganizationForUserMock).toHaveBeenCalledTimes(1);
  });
});

describe("requireClinicManagementApiContext", () => {
  it("denies platform admin from organization management in admin mode", async () => {
    const admin = { ...session("admin"), adminMode: true };
    getCurrentSessionMock.mockResolvedValueOnce(admin);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: ORG_1,
        platformUserId: admin.user.userId,
        role: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });

    const gate = await requireClinicManagementApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
  });

  it("returns resolved context for a management-capable doctor membership", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: ORG_1,
        platformUserId: doctor.user.userId,
        role: "owner",
        specialistId: "specialist-1",
        canManageOrganization: true,
        canManageAllSpecialists: true,
      },
    });

    const gate = await requireClinicManagementApiContext();

    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.ctx.membershipRole).toBe("owner");
    expect(gate.ctx.canManageOrganization).toBe(true);
  });

  it("returns forbidden for a plain specialist membership", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: ORG_1,
        platformUserId: doctor.user.userId,
        role: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });

    const gate = await requireClinicManagementApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
  });

});

describe("requireDoctorWorkspaceContext", () => {
  it("resolves RSC context for doctor role", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: ORG_1,
        platformUserId: doctor.user.userId,
        role: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });

    await expect(requireDoctorWorkspaceContext()).resolves.toMatchObject({
      session: doctor,
      organizationId: ORG_1,
      membershipRole: "doctor",
    });
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "staff",
      organizationId: ORG_1,
      platformUserId: doctor.user.userId,
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects RSC context when membership is missing", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));
    resolveOrganizationForUserMock.mockResolvedValueOnce({ ok: false, reason: "no_active_membership" });

    await expect(requireDoctorWorkspaceContext()).rejects.toThrow("redirect:");
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an admin membership in management but out of the clinical workspace", async () => {
    const adminMember = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(adminMember);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        membershipId: "membership-admin",
        organizationId: ORG_1,
        platformUserId: adminMember.user.userId,
        role: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
        canAccessClinicalWorkspace: false,
      },
    });

    await expect(requireDoctorWorkspaceContext()).rejects.toThrow(
      "redirect:/app/settings?tab=organization",
    );
  });
});
