import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const upsertServiceMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({ requireEntitlement: requireEntitlementMock }));
vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: string, callback: () => unknown) => callback(),
}));

import { POST } from "./route";

describe("POST /api/admin/booking-engine/services entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", service: { services: { upsertService: upsertServiceMock } } },
    });
    requireEntitlementMock.mockResolvedValue({ ok: true });
  });

  it("denies booking entitlement after composed auth without upserting service", async () => {
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic: "booking" }, { status: 403 }),
    });

    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }));

    expect(res.status).toBe(403);
    expect(upsertServiceMock).not.toHaveBeenCalled();
    expect(requireClinicManagementBookingEngineMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireEntitlementMock.mock.invocationCallOrder[0]!,
    );
  });
});
