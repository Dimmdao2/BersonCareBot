import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getCityByIdMock = vi.hoisted(() => vi.fn());
const updateCityByIdMock = vi.hoisted(() => vi.fn());
const deactivateCityMock = vi.hoisted(() => vi.fn());
const resolveOrganizationForUserMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    context: {
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
      membershipId: "membership-1",
      role: "owner",
      specialistId: null,
      canManageOrganization: true,
      canManageAllSpecialists: true,
    },
  })),
);

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      getCityById: getCityByIdMock,
      updateCityById: updateCityByIdMock,
      deactivateCity: deactivateCityMock,
    },
    organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
  })),
}));

import { DELETE, GET, PATCH } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

const testCityId = "550e8400-e29b-41d4-a716-446655440001";

describe("cities/[id] route", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getCityByIdMock.mockReset();
    updateCityByIdMock.mockReset();
    deactivateCityMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("GET checks the platform boundary before parsing an id", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(403);
  });

  it("GET does not expose a global city to platform admin before U9", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    getCityByIdMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: testCityId }),
    });
    expect(res.status).toBe(403);
    expect(getCityByIdMock).not.toHaveBeenCalled();
  });

  it("GET remains fail-closed even when a city exists", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    getCityByIdMock.mockResolvedValue({ id: testCityId });
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: testCityId }),
    });
    expect(res.status).toBe(403);
    expect(getCityByIdMock).not.toHaveBeenCalled();
  });

  it("PATCH checks the platform boundary before validating the body", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
      { params: Promise.resolve({ id: testCityId }) },
    );
    expect(res.status).toBe(403);
    expect(updateCityByIdMock).not.toHaveBeenCalled();
  });

  it("DELETE remains fail-closed until U9 global governance", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    deactivateCityMock.mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: testCityId }),
    });
    expect(res.status).toBe(403);
    expect(deactivateCityMock).not.toHaveBeenCalled();
  });
});
