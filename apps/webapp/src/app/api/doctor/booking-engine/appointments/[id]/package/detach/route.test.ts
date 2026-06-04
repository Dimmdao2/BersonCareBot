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

const APPT_ID = "550e8400-e29b-41d4-a716-446655440020";

describe("POST appointments/[id]/package/detach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "u1" } } },
    });
    runPackageDetachMock.mockResolvedValue(
      Response.json({ ok: true, result: {} }, { status: 200 }),
    );
  });

  it("delegates to runPackageDetach with outcome", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: "release_reserve", confirmPastTwice: true }),
      }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    expect(res.status).toBe(200);
    expect(runPackageDetachMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      appointmentId: APPT_ID,
      createdByPlatformUserId: "u1",
      outcome: "release_reserve",
      confirmPastTwice: true,
    });
  });

  it("returns 409 when detach reports late_detach_choice_required", async () => {
    runPackageDetachMock.mockResolvedValue(
      Response.json({ ok: false, error: "late_detach_choice_required" }, { status: 409 }),
    );
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("late_detach_choice_required");
  });
});
