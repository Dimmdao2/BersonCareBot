import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireClinicManagementApiContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireClinicManagementApiContext: () => requireClinicManagementApiContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

const ORG_ID = "ed63b540-3fb6-499d-897c-f52227ea5dd8";

describe("GET /api/clinic/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClinicManagementApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_ID },
    });
  });

  it("returns the clinic-management guard response before resolving deps", async () => {
    requireClinicManagementApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const res = await GET();

    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("lists only members from the guard organization", async () => {
    const listOrganizationMembers = vi.fn().mockResolvedValue([
      {
        id: "membership-1",
        organizationId: ORG_ID,
        platformUserId: "user-1",
        role: "owner",
        status: "active",
        specialistId: "specialist-1",
        displayName: "Owner",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
      {
        id: "membership-2",
        organizationId: ORG_ID,
        platformUserId: "user-2",
        role: "doctor",
        status: "active",
        specialistId: null,
        displayName: null,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
    ]);
    buildAppDepsMock.mockReturnValue({
      organizationMembership: { listOrganizationMembers },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(listOrganizationMembers).toHaveBeenCalledWith(ORG_ID);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      members: [
        {
          id: "membership-1",
          displayName: "Owner",
          role: "owner",
          status: "active",
          canManageOrganization: true,
          specialistLinked: true,
        },
        {
          id: "membership-2",
          displayName: null,
          role: "doctor",
          status: "active",
          canManageOrganization: false,
          specialistLinked: false,
        },
      ],
    });
  });
});
