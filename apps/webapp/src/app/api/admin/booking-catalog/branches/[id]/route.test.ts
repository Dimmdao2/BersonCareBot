import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getBranchByIdMock = vi.hoisted(() => vi.fn());
const updateBranchByIdMock = vi.hoisted(() => vi.fn());
const deactivateBranchMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      getBranchById: getBranchByIdMock,
      updateBranchById: updateBranchByIdMock,
      deactivateBranch: deactivateBranchMock,
    },
  })),
}));

import { PATCH } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("PATCH /api/admin/booking-catalog/branches/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    updateBranchByIdMock.mockReset();
  });

  it("returns 400 on PostgreSQL foreign_key_violation (23503)", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const pgErr = Object.assign(new Error("fk"), { code: "23503" });
    updateBranchByIdMock.mockRejectedValue(pgErr);
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId: "550e8400-e29b-41d4-a716-446655440001" }),
      }),
      { params: Promise.resolve({ id: uuid }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("foreign_key_violation");
  });
});
