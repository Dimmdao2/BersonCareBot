import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const offerCatalogPackageToPatientMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: {
      offerCatalogPackageToPatient: offerCatalogPackageToPatientMock,
    },
  }),
}));

import { POST } from "./route";

describe("/api/doctor/booking-engine/patient-packages POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "550e8400-e29b-41d4-a716-446655440099" } },
      },
    });
    offerCatalogPackageToPatientMock.mockResolvedValue({ id: "pp-1", status: "offered" });
  });

  it("returns JSON error on catalog_not_found", async () => {
    offerCatalogPackageToPatientMock.mockRejectedValueOnce(new Error("catalog_not_found"));
    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/patient-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "catalog",
          platformUserId: "550e8400-e29b-41d4-a716-446655440001",
          subscriptionPackageId: "550e8400-e29b-41d4-a716-446655440002",
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("catalog_not_found");
  });
});
