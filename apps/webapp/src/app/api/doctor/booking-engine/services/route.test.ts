import { describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

import { GET } from "./route";

describe("GET /api/doctor/booking-engine/services", () => {
  it("returns services list and location availability for authorized doctor", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        service: {
          services: {
            listServices: vi.fn().mockResolvedValue([{ id: "svc-1", title: "Первичный прием" }]),
            listServiceLocationAvailability: vi.fn().mockResolvedValue([
              { id: "la-1", organizationId: "org-1", serviceId: "svc-1", branchId: "br-1", isActive: true },
            ]),
          },
        },
      },
    });

    const res = await GET();
    const json = (await res.json()) as {
      ok?: boolean;
      services?: Array<{ id: string; title: string }>;
      locationAvailability?: Array<{ serviceId: string; branchId: string }>;
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.services).toEqual([{ id: "svc-1", title: "Первичный прием" }]);
    expect(json.locationAvailability).toEqual([
      { id: "la-1", organizationId: "org-1", serviceId: "svc-1", branchId: "br-1", isActive: true },
    ]);
  });

  it("returns gate response for unauthorized user", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });

    const res = await GET();
    expect(res.status).toBe(403);
  });
});
