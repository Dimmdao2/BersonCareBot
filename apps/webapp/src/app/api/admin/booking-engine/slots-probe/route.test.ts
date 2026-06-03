import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());
const getSlotsMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
    patientBooking: {
      getSlots: getSlotsMock,
    },
    systemSettings: {
      getSetting: getSettingMock,
    },
  }),
}));

import { GET } from "./route";

describe("/api/admin/booking-engine/slots-probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        service: {
          catalog: {
            getBranch: getBranchMock,
            listSpecialists: listSpecialistsMock,
          },
        },
      },
    });
    getBranchMock.mockResolvedValue({
      id: "branch-1",
      organizationId: "org-1",
      timezone: "Europe/Moscow",
    });
    listSpecialistsMock.mockResolvedValue([{ id: "spec-1", isActive: true }]);
    resolveLegacyBranchServiceIdMock.mockResolvedValue("legacy-bs-1");
    getSettingMock.mockResolvedValue({ valueJson: { value: "canonical" } });
    getSlotsMock.mockResolvedValue([
      {
        date: "2026-06-04",
        slots: [{ startAt: "2026-06-04T07:00:00.000Z", endAt: "2026-06-04T07:30:00.000Z" }],
      },
    ]);
  });

  it("returns patient-path slots for date", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/admin/booking-engine/slots-probe?branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=550e8400-e29b-41d4-a716-446655440002&date=2026-06-04",
      ),
    );
    const json = (await res.json()) as { ok?: boolean; slots?: string[]; bookingSlotsReadSource?: string };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.bookingSlotsReadSource).toBe("canonical");
    expect(json.slots?.length).toBe(1);
    expect(getSlotsMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "in_person", branchServiceId: "legacy-bs-1", date: "2026-06-04" }),
    );
  });
});
