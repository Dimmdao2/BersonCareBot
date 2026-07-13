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
} from "./requireRole";

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
      },
    });

    const gate = await requireDoctorWorkspaceApiContext({ selectedOrganizationId: "org-1" });

    expect(gate).toEqual({
      ok: true,
      ctx: {
        session: doctor,
        organizationId: ORG_1,
        membershipId: "membership-1",
        membershipRole: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });
    expect(resolveOrganizationForUserMock).toHaveBeenCalledWith({
      platformUserId: doctor.user.userId,
      selectedOrganizationId: "org-1",
    });
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "staff",
      organizationId: ORG_1,
      platformUserId: doctor.user.userId,
    });
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

  it("maps multi-organization state to selection-required response", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("admin"));
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: false,
      reason: "membership_selection_required",
      organizationIds: [ORG_1, ORG_2],
    });

    const gate = await requireDoctorWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(409);
    await expect(gate.response.json()).resolves.toMatchObject({
      ok: false,
      error: "organization_selection_required",
    });
  });
});

describe("requireDoctorApiSession", () => {
  it("does not block when best-effort staff principal resolution fails", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);
    resolveOrganizationForUserMock.mockResolvedValueOnce({ ok: false, reason: "no_active_membership" });

    const gate = await requireDoctorApiSession();

    expect(gate).toEqual({ ok: true, session: doctor });
    expect(getCurrentDbPrincipal()).toMatchObject({ kind: "bootstrap" });
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

  it("returns forbidden for admin when adminMode is disabled", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({ ...session("admin"), adminMode: false });

    const gate = await requireAdminWorkspaceApiContext();

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("returns resolved organization membership context for admin mode", async () => {
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

    const gate = await requireAdminWorkspaceApiContext({ selectedOrganizationId: "org-1" });

    expect(gate).toEqual({
      ok: true,
      ctx: {
        session: admin,
        organizationId: ORG_1,
        membershipId: "membership-1",
        membershipRole: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
      },
    });
    expect(resolveOrganizationForUserMock).toHaveBeenCalledWith({
      platformUserId: admin.user.userId,
      selectedOrganizationId: "org-1",
    });
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "staff",
      organizationId: ORG_1,
      platformUserId: admin.user.userId,
    });
  });
});

describe("requireClinicManagementApiContext", () => {
  it("returns resolved context for admin in admin mode", async () => {
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

    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.ctx.organizationId).toBe(ORG_1);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: "staff",
      organizationId: ORG_1,
      platformUserId: admin.user.userId,
    });
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

  it("rejects selected organizations outside the caller memberships", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: false,
      reason: "selected_membership_not_found",
    });

    const gate = await requireClinicManagementApiContext({ selectedOrganizationId: ORG_2 });

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    expect(resolveOrganizationForUserMock).toHaveBeenCalledWith({
      platformUserId: doctor.user.userId,
      selectedOrganizationId: ORG_2,
    });
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
});
