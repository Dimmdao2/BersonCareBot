import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getServiceByIdMock = vi.hoisted(() => vi.fn());
const updateServiceByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      getServiceById: getServiceByIdMock,
      updateServiceById: updateServiceByIdMock,
    },
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

  it("returns 400 on invalid id", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 90 }),
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when service missing", async () => {
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
    expect(res.status).toBe(404);
  });

  it("returns 200 and updated service on valid patch", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const updated = {
      id: uuid,
      title: "Приём",
      description: null,
      durationMinutes: 90,
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
        body: JSON.stringify({ durationMinutes: 90, priceMinor: 500000 }),
      }),
      { params: Promise.resolve({ id: uuid }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: typeof updated };
    expect(body.ok).toBe(true);
    expect(body.service.durationMinutes).toBe(90);
    expect(updateServiceByIdMock).toHaveBeenCalledWith(uuid, {
      durationMinutes: 90,
      priceMinor: 500000,
    });
  });

  it("returns 409 on unique_violation when title+duration conflicts", async () => {
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
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unique_violation");
  });
});
