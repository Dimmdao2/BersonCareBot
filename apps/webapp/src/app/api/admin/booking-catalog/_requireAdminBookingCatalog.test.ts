import { beforeEach, describe, expect, it, vi } from "vitest";

const LEGACY_ORG = "a0000000-0000-4000-8000-000000000001";
const getSessionMock = vi.hoisted(() => vi.fn());
const resolveOrganizationForUserMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    context: {
      organizationId: "a0000000-0000-4000-8000-000000000001",
      membershipId: "membership-1",
      role: "owner",
      specialistId: null,
      canManageOrganization: true,
      canManageAllSpecialists: true,
    },
  })),
);
const listCitiesAdminMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() =>
  vi.fn(() => ({
    bookingCatalogPort: { listCitiesAdmin: listCitiesAdminMock },
    organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
  })),
);

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildAppDepsMock }));

import {
  requireAdminBookingCatalog,
  requireClinicManagementBookingCatalogRead,
} from "./_requireAdminBookingCatalog";

describe("requireAdminBookingCatalog", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
    buildAppDepsMock.mockClear();
  });

  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);

    const gate = await requireAdminBookingCatalog();

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("keeps global legacy catalog mutations fail-closed for platform admin until U9", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "a1", role: "admin", bindings: {} },
      adminMode: true,
    });

    const gate = await requireAdminBookingCatalog();

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("does not promote a clinic owner into global catalog governance", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "owner-1", role: "doctor", bindings: {} },
    });

    const gate = await requireAdminBookingCatalog();

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });
});

describe("requireClinicManagementBookingCatalogRead", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
    buildAppDepsMock.mockClear();
  });

  it("allows the legacy organization owner to read reference catalog data", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "owner-1", role: "doctor", bindings: {} },
    });

    const gate = await requireClinicManagementBookingCatalogRead();

    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.ctx.organizationId).toBe(LEGACY_ORG);
  });

  it("does not expose the unscoped legacy catalog to another clinic owner", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "owner-2", role: "doctor", bindings: {} },
    });
    resolveOrganizationForUserMock.mockResolvedValueOnce({
      ok: true,
      context: {
        organizationId: "550e8400-e29b-41d4-a716-446655440010",
        membershipId: "membership-2",
        role: "owner",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
      },
    });

    const gate = await requireClinicManagementBookingCatalogRead();

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });
});
