import { describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() =>
  vi.fn(() => ({
    bookingCatalogPort: { listCitiesAdmin: vi.fn() },
  })),
);

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildAppDepsMock }));

import { requireAdminBookingCatalog } from "./_requireAdminBookingCatalog";

describe("requireAdminBookingCatalog", () => {
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
    buildAppDepsMock.mockReturnValueOnce({ bookingCatalogPort: null } as never);
    const g = await requireAdminBookingCatalog();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(503);
  });
});
