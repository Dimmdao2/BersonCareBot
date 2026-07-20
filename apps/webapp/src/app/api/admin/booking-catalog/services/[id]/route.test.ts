import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getServiceByIdMock = vi.hoisted(() => vi.fn());
const updateServiceByIdMock = vi.hoisted(() => vi.fn());
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
      getServiceById: getServiceByIdMock,
      updateServiceById: updateServiceByIdMock,
    },
    organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
  })),
}));

import { PATCH } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("PATCH /api/admin/booking-catalog/services/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getServiceByIdMock.mockReset();
    updateServiceByIdMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 90 }),
      }),
      { params: Promise.resolve({ id: uuid }) },
    );
    expect(res.status).toBe(401);
  });

  it("checks the global governance boundary before parsing the id", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 90 }),
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(403);
  });

  it("does not query a missing global service before U9", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    updateServiceByIdMock.mockResolvedValue(null);
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 90, priceMinor: 500000 }),
      }),
      { params: Promise.resolve({ id: uuid }) },
    );
    expect(res.status).toBe(403);
    expect(updateServiceByIdMock).not.toHaveBeenCalled();
  });

  it("keeps a valid global service patch fail-closed until U9", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const updated = {
      id: uuid,
      title: "Приём",
      description: null,
      durationMinutes: 90,
      breakAfterMinutes: 20,
      priceMinor: 500000,
      isActive: true,
      sortOrder: 0,
      createdAt: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    updateServiceByIdMock.mockResolvedValue(updated);
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 90, breakAfterMinutes: 20, priceMinor: 500000 }),
      }),
      { params: Promise.resolve({ id: uuid }) },
    );
    expect(res.status).toBe(403);
    expect(updateServiceByIdMock).not.toHaveBeenCalled();
  });

  it("does not expose patch validation before U9", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ breakAfterMinutes: 7 }),
      }),
      { params: Promise.resolve({ id: uuid }) },
    );
    expect(res.status).toBe(403);
  });

  it("does not reach database conflict handling before U9", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    updateServiceByIdMock.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Приём", durationMinutes: 60 }),
      }),
      { params: Promise.resolve({ id: uuid }) },
    );
    expect(res.status).toBe(403);
    expect(updateServiceByIdMock).not.toHaveBeenCalled();
  });
});
