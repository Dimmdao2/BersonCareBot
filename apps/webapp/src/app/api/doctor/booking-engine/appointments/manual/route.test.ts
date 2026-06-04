import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const createAppointmentMock = vi.hoisted(() => vi.fn());
const transitionAppointmentStatusMock = vi.hoisted(() => vi.fn());
const deleteAppointmentHardMock = vi.hoisted(() => vi.fn());
const emitBookingEventMock = vi.hoisted(() => vi.fn());
const createRecordMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());
const resolveBranchServiceMock = vi.hoisted(() => vi.fn());
const assertSlotAvailableMock = vi.hoisted(() => vi.fn());

vi.mock("../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: () => ({
    createRecord: createRecordMock,
    deleteRecord: vi.fn(),
    emitBookingEvent: emitBookingEventMock,
  }),
}));

vi.mock("@/app-layer/booking/emitPackageCalendarSync", () => ({
  emitPackageLinkedCalendarSync: vi.fn().mockResolvedValue("skipped"),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      assertSlotAvailable: assertSlotAvailableMock,
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
    bookingCatalog: {
      resolveBranchService: resolveBranchServiceMock,
    },
    memberships: null,
    patientBooking: null,
  }),
}));

import { POST } from "./route";

describe("POST manual appointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns external_slot_taken and rolls back appointment on Rubitime conflict", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          createAppointment: createAppointmentMock,
          transitionAppointmentStatus: transitionAppointmentStatusMock,
          deleteAppointmentHard: deleteAppointmentHardMock,
          upsertRubitimeAppointmentMapping: vi.fn(),
        },
      },
    });
    createAppointmentMock.mockResolvedValue({
      id: "appt-1",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
      platformUserId: null,
      phoneNormalized: null,
      attributionJson: {},
      organizationId: "org-1",
      status: "confirmed",
      source: "admin_manual",
    });
    createRecordMock.mockRejectedValue(new Error("slot_already_taken"));
    deleteAppointmentHardMock.mockResolvedValue(true);
    assertSlotAvailableMock.mockResolvedValue(undefined);
    resolveLegacyBranchServiceIdMock.mockResolvedValue("branch-service-id");
    resolveBranchServiceMock.mockResolvedValue({
      branch: { rubitimeBranchId: "123" },
      specialist: { rubitimeCooperatorId: "456" },
      branchService: { rubitimeServiceId: "789" },
    });

    const res = await POST(
      new Request("http://localhost/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: "11111111-1111-4111-8111-111111111111",
          serviceId: "22222222-2222-4222-8222-222222222222",
          specialistId: "33333333-3333-4333-8333-333333333333",
          startAt: "2026-06-01T10:00:00.000Z",
          endAt: "2026-06-01T11:00:00.000Z",
          durationMinutes: 60,
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string; hint?: string };
    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("external_slot_taken");
    expect(json.hint).toBe("refresh_calendar");
    expect(deleteAppointmentHardMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      appointmentId: "appt-1",
    });
    expect(transitionAppointmentStatusMock).not.toHaveBeenCalled();
    expect(emitBookingEventMock).not.toHaveBeenCalled();
  });

  it("rolls back appointment when Rubitime create returns empty rubitimeId", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          createAppointment: createAppointmentMock,
          transitionAppointmentStatus: transitionAppointmentStatusMock,
          deleteAppointmentHard: deleteAppointmentHardMock,
          upsertRubitimeAppointmentMapping: vi.fn(),
        },
      },
    });
    createAppointmentMock.mockResolvedValue({
      id: "appt-1",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
      platformUserId: null,
      phoneNormalized: null,
      attributionJson: {},
      organizationId: "org-1",
      status: "confirmed",
      source: "admin_manual",
    });
    createRecordMock.mockResolvedValue({ rubitimeId: null, raw: {} });
    deleteAppointmentHardMock.mockResolvedValue(true);
    assertSlotAvailableMock.mockResolvedValue(undefined);
    resolveLegacyBranchServiceIdMock.mockResolvedValue("branch-service-id");
    resolveBranchServiceMock.mockResolvedValue({
      branch: { rubitimeBranchId: "123" },
      specialist: { rubitimeCooperatorId: "456" },
      branchService: { rubitimeServiceId: "789" },
    });

    const res = await POST(
      new Request("http://localhost/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: "11111111-1111-4111-8111-111111111111",
          serviceId: "22222222-2222-4222-8222-222222222222",
          specialistId: "33333333-3333-4333-8333-333333333333",
          startAt: "2026-06-01T10:00:00.000Z",
          endAt: "2026-06-01T11:00:00.000Z",
          durationMinutes: 60,
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("rubitime_sync_failed");
    expect(deleteAppointmentHardMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      appointmentId: "appt-1",
    });
    expect(transitionAppointmentStatusMock).not.toHaveBeenCalled();
    expect(emitBookingEventMock).not.toHaveBeenCalled();
  });
});
