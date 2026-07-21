import { beforeEach, describe, expect, it, vi } from "vitest";

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback()),
);
const setOnlineLocationStateMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({ requireEntitlementForMutation: requireEntitlementMock }));
vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));
import { PUT } from "./route";

describe("PUT /api/admin/booking-engine/online-location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-a",
        service: { catalog: { setOnlineLocationState: setOnlineLocationStateMock } },
      },
    });
    requireEntitlementMock.mockResolvedValue({ ok: true });
    setOnlineLocationStateMock.mockResolvedValue({ id: "online-a", isActive: true });
  });

  it("uses only the organization from the authenticated management context", async () => {
    const res = await PUT(
      new Request("http://localhost/api/admin/booking-engine/online-location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true, organizationId: "org-b" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(setOnlineLocationStateMock).not.toHaveBeenCalled();

    const okRes = await PUT(
      new Request("http://localhost/api/admin/booking-engine/online-location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      }),
    );
    expect(okRes.status).toBe(200);
    expect(setOnlineLocationStateMock).toHaveBeenCalledWith({ organizationId: "org-a", isActive: true });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.anything(),
      "admin.booking-engine.online-location.set-state",
      expect.any(Function),
    );
  });

  it.each([
    "entitlement_required",
    "commercial_read_only",
    "commercial_blocked",
  ] as const)("denies the write when the entitlement gate returns %s", async (error) => {
    const { NextResponse } = await import("next/server");
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error, mechanic: "booking" }, { status: 403 }),
    });

    const res = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ isActive: false }) }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error, mechanic: "booking" });
    expect(setOnlineLocationStateMock).not.toHaveBeenCalled();
  });
});
