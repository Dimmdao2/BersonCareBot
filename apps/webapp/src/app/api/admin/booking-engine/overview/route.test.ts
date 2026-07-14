import { describe, expect, it, vi } from "vitest";

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { getSetting: getSettingMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/booking-engine/overview", () => {
  it("returns canonical doctor read source even when the retired setting row is legacy", async () => {
    const bridge = {
      getMappingSummary: vi.fn().mockResolvedValue({
        branches: 1,
        specialists: 1,
        services: 1,
        availabilities: 0,
        appointments: 0,
      }),
      isBridgeEnabled: vi.fn().mockResolvedValue(true),
    };
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        service: {
          organization: { getOrganization: vi.fn().mockResolvedValue({ id: "org-1" }) },
          catalog: {
            listBranches: vi.fn().mockResolvedValue([]),
            listRooms: vi.fn().mockResolvedValue([]),
            listSpecialists: vi.fn().mockResolvedValue([]),
            listSpecialistRooms: vi.fn().mockResolvedValue([]),
          },
          services: {
            listServices: vi.fn().mockResolvedValue([]),
            listSpecialistServiceAvailability: vi.fn().mockResolvedValue([]),
            listServiceLocationAvailability: vi.fn().mockResolvedValue([]),
          },
          bridge,
        },
      },
    });
    getSettingMock.mockImplementation(async (key: string) => {
      if (key === "booking_doctor_appointments_read_source") {
        return { valueJson: { value: "rubitime_legacy" } };
      }
      if (key === "booking_slots_read_source") {
        return { valueJson: { value: "rubitime" } };
      }
      return null;
    });

    const res = await GET();
    const json = (await res.json()) as {
      ok?: boolean;
      doctorAppointmentsReadSource?: string;
      bookingSlotsReadSource?: string;
      calendarReadSource?: string;
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.doctorAppointmentsReadSource).toBe("canonical");
    expect(json.bookingSlotsReadSource).toBe("canonical");
    expect(json.calendarReadSource).toBe("canonical");
  });
});
