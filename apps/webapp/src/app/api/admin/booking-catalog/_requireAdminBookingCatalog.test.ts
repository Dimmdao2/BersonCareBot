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
const buildAppDepsMock = vi.hoisted(() =>
  vi.fn(() => ({
    bookingCatalogPort: { listCitiesAdmin: vi.fn() },
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
    const g = await requireAdminBookingCatalog();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(401);
  });

  it("returns 503 when catalog port is null", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "a1", role: "admin", bindings: {} },
      adminMode: true,
    });
    buildAppDepsMock
      .mockReturnValueOnce({
        bookingCatalogPort: { listCitiesAdmin: vi.fn() },
        organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
      } as never)
      .mockReturnValueOnce({
        bookingCatalogPort: null,
        organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
      } as never);
    const g = await requireAdminBookingCatalog();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(503);
  });

  it("returns selected organization context for admin catalog access", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "a1", role: "admin", bindings: {} },
      adminMode: true,
    });
    const g = await requireAdminBookingCatalog();
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.ctx.organizationId).toBe(LEGACY_ORG);
    expect(resolveOrganizationForUserMock).toHaveBeenCalledWith({
      platformUserId: "a1",
      selectedOrganizationId: undefined,
    });
  });

  it("allows a clinic owner to read the legacy reference catalog", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "owner-1", role: "doctor", bindings: {} },
    });

    const g = await requireClinicManagementBookingCatalogRead();

    expect(g.ok).toBe(true);
    if (g.ok) expect(g.ctx.organizationId).toBe(LEGACY_ORG);
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

    const g = await requireClinicManagementBookingCatalogRead();

    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(403);
  });

  it("keeps legacy reference catalog mutations global-admin-only", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "owner-1", role: "doctor", bindings: {} },
    });

    const g = await requireAdminBookingCatalog();

    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(403);
  });
});
