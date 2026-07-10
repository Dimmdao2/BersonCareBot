import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const listDirectoryMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    doctorWorkspace: {
      listDirectory: listDirectoryMock,
    },
  })),
}));

import { GET } from "./route";

beforeEach(() => {
  requireDoctorWorkspaceApiContextMock.mockReset();
  listDirectoryMock.mockReset();
});

describe("GET /api/doctor/workspace/directory", () => {
  it("returns read-only directory for resolved workspace context", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: true,
      ctx: {
        session: { user: { userId: "doctor-1", role: "doctor", displayName: "Doctor", bindings: {} } },
        organizationId: "org-1",
        membershipId: "membership-1",
        membershipRole: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });
    listDirectoryMock.mockResolvedValueOnce({
      specialists: [
        {
          id: "specialist-1",
          fullName: "Doctor Specialist",
          isActive: true,
          isCurrentUserSpecialist: true,
        },
      ],
      members: [
        {
          membershipId: "membership-1",
          platformUserId: "doctor-1",
          role: "doctor",
          specialistId: "specialist-1",
          status: "active",
          displayName: "Doctor",
        },
      ],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      directory: {
        specialists: [{ id: "specialist-1", isCurrentUserSpecialist: true }],
        members: [{ membershipId: "membership-1" }],
      },
    });
    expect(listDirectoryMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      organizationName: null,
      membershipId: "membership-1",
      membershipRole: "doctor",
      specialistId: "specialist-1",
      canManageOrganization: false,
      canManageAllSpecialists: false,
      selectedSpecialistId: "specialist-1",
    });
  });

  it("returns gate response when workspace access is denied", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(listDirectoryMock).not.toHaveBeenCalled();
  });
});
