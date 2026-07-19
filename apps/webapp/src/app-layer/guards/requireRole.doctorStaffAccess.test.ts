import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/shared/types/session";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const resolveOrganizationForUserMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
);

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock } }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

import { buildOwnHubUrlWithAccessDeniedToast } from "@/shared/lib/appAccessDeniedToast";
import {
  getOptionalPatientSession,
  requireDoctorAccess,
  requireOrganizationManagementContext,
  requirePatientAccess,
  requireStaffAccountPage,
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
  resolveOrganizationForUserMock.mockReset();
  resolveOrganizationForUserMock.mockResolvedValue({ ok: false, reason: "no_active_membership" });
  redirectMock.mockReset();
});

describe("requireStaffAccountPage", () => {
  it("allows a staff account without resolving organization membership", async () => {
    const doctor = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doctor);

    await expect(requireStaffAccountPage()).resolves.toBe(doctor);
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("keeps an explicit platform operator in the platform shell", async () => {
    const admin = { ...session("admin"), adminMode: true };
    getCurrentSessionMock.mockResolvedValueOnce(admin);

    await expect(requireStaffAccountPage()).rejects.toThrow("redirect:/app/doctor/system-health");
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("denies a patient account", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("client"));
    const target = buildOwnHubUrlWithAccessDeniedToast("client");
    await expect(requireStaffAccountPage()).rejects.toThrow(`redirect:${target}`);
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
      "redirect:/app/doctor/system-health",
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
    await expect(requireDoctorAccess()).rejects.toThrow("redirect:/app/manage");
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
