import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireClinicManagementApiContextMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireClinicManagementApiContext: () => requireClinicManagementApiContextMock(),
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlement: (...args: unknown[]) => requireEntitlementMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

const ORG_ID = "ed63b540-3fb6-499d-897c-f52227ea5dd8";
const defaultSeats = { limit: null, used: 1, available: null };

describe("GET /api/clinic/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClinicManagementApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_ID },
    });
    requireEntitlementMock.mockResolvedValue({ ok: true });
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
    const getSeatStatus = vi.fn().mockResolvedValue(defaultSeats);
    buildAppDepsMock.mockReturnValue({
      organizationMembership: { listOrganizationMembers },
      clinicSeats: { getSeatStatus },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(listOrganizationMembers).toHaveBeenCalledWith(ORG_ID);
    expect(getSeatStatus).toHaveBeenCalledWith(ORG_ID);
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
          seatConsuming: true,
        },
        {
          id: "membership-2",
          displayName: null,
          role: "doctor",
          status: "active",
          canManageOrganization: false,
          specialistLinked: false,
          seatConsuming: true,
        },
      ],
      seats: defaultSeats,
    });
  });
});
