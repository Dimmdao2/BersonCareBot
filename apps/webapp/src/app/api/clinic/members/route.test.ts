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
const defaultSeats = { limit: 3, used: 1, available: 2 };

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

  it("lists only members from the guard organization and derives seatConsuming from the specialist binding, not role", async () => {
    const listOrganizationMembers = vi.fn().mockResolvedValue([
      {
        id: "membership-1",
        organizationId: ORG_ID,
        platformUserId: "user-1",
        role: "owner",
        status: "active",
        specialistId: null,
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
        specialistId: "specialist-2",
        displayName: null,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
      {
        id: "membership-3",
        organizationId: ORG_ID,
        platformUserId: "user-3",
        role: "admin",
        status: "active",
        specialistId: "specialist-3",
        displayName: "Admin who also treats patients",
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
          // Owner without a specialist binding: manages the org but does not consume a seat.
          id: "membership-1",
          displayName: "Owner",
          role: "owner",
          status: "active",
          canManageOrganization: true,
          specialistLinked: false,
          seatConsuming: false,
        },
        {
          // Doctor with a specialist binding: consumes a seat.
          id: "membership-2",
          displayName: null,
          role: "doctor",
          status: "active",
          canManageOrganization: false,
          specialistLinked: true,
          seatConsuming: true,
        },
        {
          // Non-clinical role can still consume a seat once bound to a specialist profile.
          id: "membership-3",
          displayName: "Admin who also treats patients",
          role: "admin",
          status: "active",
          canManageOrganization: true,
          specialistLinked: true,
          seatConsuming: true,
        },
      ],
      seats: defaultSeats,
    });
  });
});
