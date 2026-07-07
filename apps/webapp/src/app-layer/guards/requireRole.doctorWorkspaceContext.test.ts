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
  buildAppDeps: vi.fn(() => ({
    organizationMembership: {
      resolveOrganizationForUser: resolveOrganizationForUserMock,
    },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

import { requireDoctorWorkspaceApiContext, requireDoctorWorkspaceContext } from "./requireRole";

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
        organizationId: "org-1",
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
        organizationId: "org-1",
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
      organizationIds: ["org-1", "org-2"],
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

describe("requireDoctorWorkspaceContext", () => {
  it("resolves RSC context for doctor role", async () => {
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
      },
    });

    await expect(requireDoctorWorkspaceContext()).resolves.toMatchObject({
      session: doctor,
      organizationId: "org-1",
      membershipRole: "doctor",
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
