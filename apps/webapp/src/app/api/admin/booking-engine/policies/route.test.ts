import { describe, expect, it, vi } from "vitest";

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const listCancellationPoliciesMock = vi.hoisted(() => vi.fn());
const listReschedulePoliciesMock = vi.hoisted(() => vi.fn());
const upsertCancellationPolicyMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingPolicies: {
      listCancellationPolicies: listCancellationPoliciesMock,
      listReschedulePolicies: listReschedulePoliciesMock,
      upsertCancellationPolicy: upsertCancellationPolicyMock,
      upsertReschedulePolicy: vi.fn(),
    },
  }),
}));

import { GET, POST } from "./route";

const ORG_ID = "99999999-9999-4999-8999-999999999999";

describe("booking-engine policies route", () => {
  it("GET returns policies list", async () => {
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_ID },
    });
    listCancellationPoliciesMock.mockResolvedValue([]);
    listReschedulePoliciesMock.mockResolvedValue([]);

    const res = await GET();
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("POST saves cancellation policy payload", async () => {
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_ID },
    });
    upsertCancellationPolicyMock.mockResolvedValue({ id: "p1" });

    const res = await POST(
      new Request("http://localhost/policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "cancellation",
          scopeLevel: "organization",
          title: "org",
          isActive: true,
          freeCancelHoursBefore: 48,
          cancellationAllowed: true,
          lateCancellationBehavior: "retain_prepayment",
          refundPrepaymentOnLate: "manual",
          chargePackageSessionOnLate: true,
          requiresStaffConfirmation: false,
          notifyPatient: false,
          notifyStaff: true,
          sortOrder: 0,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertCancellationPolicyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeLevel: "organization",
        lateCancellationBehavior: "retain_prepayment",
        notifyPatient: false,
      }),
    );
  });
});
