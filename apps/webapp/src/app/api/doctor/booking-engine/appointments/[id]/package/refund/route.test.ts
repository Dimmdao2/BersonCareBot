import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const runPackageDetachMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app/api/booking-engine/packageDetachShared", () => ({
  runPackageDetach: runPackageDetachMock,
}));

import { POST } from "./route";

const APPT_ID = "550e8400-e29b-41d4-a716-446655440022";

describe("POST appointments/[id]/package/refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "u1" } } },
    });
    runPackageDetachMock.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));
  });

  it("calls detach with refund_consumed outcome", async () => {
    await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    expect(runPackageDetachMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPT_ID,
        outcome: "refund_consumed",
      }),
    );
  });
});
