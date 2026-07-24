import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedBranchService } from "@/modules/booking-catalog/types";
import type { BookingCatalogService } from "@/modules/booking-catalog/service";
import { createBookingSchedulingService } from "@/modules/booking-scheduling/service";
import type { PatientBookingRecord } from "./types";
import { createPatientBookingService } from "./service";

// sendBookingConfirmationEmail — best-effort side-effect, тестируется отдельно (#81).
vi.mock("./sendBookingConfirmationEmail", () => ({
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(false),
}));

const bookingsPort = vi.hoisted(() => ({
  createPending: vi.fn(),
  markConfirmed: vi.fn(),
  markFailedSync: vi.fn(),
  markCancelling: vi.fn(),
  markCancelled: vi.fn(),
  updateSlotsAfterReschedule: vi.fn(),
  getByIdForUser: vi.fn(),
  getByRubitimeId: vi.fn(),
  upsertFromRubitime: vi.fn(),
  listUpcomingByUser: vi.fn(),
  listHistoryByUser: vi.fn(),
}));

const syncPort = vi.hoisted(() => ({
  fetchSlots: vi.fn(),
  createRecord: vi.fn(),
  cancelRecord: vi.fn(),
  deleteRecord: vi.fn(),
  updateRecord: vi.fn(),
  emitBookingEvent: vi.fn(),
}));

function resolvedFixture(): ResolvedBranchService {
  return {
    branchService: {
      id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      branchId: "brbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      serviceId: "svbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      specialistId: "spbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      rubitimeServiceId: "67591",
      isActive: true,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    branch: {
      id: "brbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      cityId: "ccbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      title: "Филиал 1",
      address: null,
      rubitimeBranchId: "17356",
      timezone: "Europe/Moscow",
      isActive: true,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    service: {
      id: "svbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      title: "Сеанс",
      description: null,
      durationMinutes: 60,
      breakAfterMinutes: 0,
      priceMinor: 0,
      isActive: true,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    specialist: {
      id: "spbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      branchId: "brbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      fullName: "Специалист",
      description: null,
      rubitimeCooperatorId: "34729",
      isActive: true,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    city: {
      id: "ccbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      code: "moscow",
      title: "Москва",
      isActive: true,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function catalogWithResolve(): BookingCatalogService {
  return {
    listCitiesForPatient: vi.fn(),
    listServicesByCity: vi.fn(),
  };
}

function sampleRow(over: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: "b1111111-1111-4111-8111-111111111111",
    userId: "u1111111-1111-4111-8111-111111111111",
    bookingType: "online",
    city: null,
    category: "general",
    slotStart: "2026-05-01T10:00:00.000Z",
    slotEnd: "2026-05-01T11:00:00.000Z",
    status: "confirmed",
    cancelledAt: null,
    cancelReason: null,
    rubitimeId: "r99",
    gcalEventId: null,
    contactPhone: "+79990001122",
    contactEmail: null,
    contactName: "Test",
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: null,
    priceMinorSnapshot: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
    rubitimeManageUrl: null,
    canonicalAppointmentId: null,
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...over,
  };
}

describe("createPatientBookingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancelBooking: markCancelling then cancelRecord then markCancelled on success (legacy)", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      isRubitimeBridgeEnabled: async () => true,
    });
    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
      reason: "busy",
    });
    expect(result).toEqual({ ok: true, notificationOutcomeFailed: true });
    expect(syncPort.emitBookingEvent).not.toHaveBeenCalled();
    expect(bookingsPort.markCancelling).toHaveBeenCalledWith(row.id);
    expect(syncPort.cancelRecord).toHaveBeenCalledWith("r1");
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: row.id,
      reason: "busy",
      status: "cancelled",
    });
  });

  it("cancelBooking: skips Rubitime cancel when bridge is disabled", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      isRubitimeBridgeEnabled: async () => false,
    });
    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
      reason: "busy",
    });
    expect(result).toEqual({ ok: true, notificationOutcomeFailed: true });
    expect(syncPort.emitBookingEvent).not.toHaveBeenCalled();
    expect(syncPort.cancelRecord).not.toHaveBeenCalled();
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: row.id,
      reason: "busy",
      status: "cancelled",
    });
  });

  it("createBooking without canonical deps fails instead of calling Rubitime create", async () => {
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      isRubitimeBridgeEnabled: async () => true,
    });
    await expect(svc.createBooking({
      userId: "u1111111-1111-4111-8111-111111111111",
      type: "online",
      organizationId: "org-1",
      category: "general",
      slotStart: "2026-05-01T10:00:00.000Z",
      slotEnd: "2026-05-01T11:00:00.000Z",
      contactName: "Test",
      contactPhone: "+79990001122",
    })).rejects.toThrow("canonical_booking_unavailable");
    expect(syncPort.createRecord).not.toHaveBeenCalled();
    expect(bookingsPort.createPending).not.toHaveBeenCalled();
  });

  it("cancelBooking: Rubitime sync failure still completes legacy cancel", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockRejectedValue(new Error("network"));

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      isRubitimeBridgeEnabled: async () => true,
    });
    const result = await svc.cancelBooking({ userId: row.userId!, bookingId: row.id });
    expect(result).toEqual({
      ok: true,
      rubitimeMirrorFailed: true,
      notificationOutcomeFailed: true,
    });
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: row.id,
      reason: undefined,
      status: "cancelled",
    });
  });

  it("cancelBooking: Rubitime sync failure invalidates canonical slots cache so next getSlots refetches", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    syncPort.cancelRecord.mockRejectedValue(new Error("network"));
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    const getOnlineSlots = vi.fn().mockResolvedValue([{ date: "2026-05-01", slots: [] }]);
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      bookingScheduling: { getOnlineSlots } as never,
      slotsTtlMs: 60_000,
      isRubitimeBridgeEnabled: async () => true,
    });
    await svc.getSlots({ type: "online", organizationId: "org-1", category: "general" });
    await svc.getSlots({ type: "online", organizationId: "org-1", category: "general" });
    expect(getOnlineSlots).toHaveBeenCalledTimes(1);

    const result = await svc.cancelBooking({ userId: row.userId!, bookingId: row.id });
    expect(result).toEqual({
      ok: true,
      rubitimeMirrorFailed: true,
      notificationOutcomeFailed: true,
    });

    await svc.getSlots({ type: "online", organizationId: "org-1", category: "general" });
    expect(getOnlineSlots).toHaveBeenCalledTimes(2);
  });

  it("cancelBooking: canonical path succeeds when doctor projection cancel fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "8442451",
      canonicalAppointmentId: "appt-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      previewPatientCancel: vi.fn().mockResolvedValue({
        ok: true,
        allowed: true,
        requiresStaffConfirmation: false,
      }),
      patientCancel: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: row.slotStart,
          endAt: row.slotEnd,
          branchId: "branch-1",
          phoneNormalized: "+79001234567",
        },
        eligibility: { reasonCode: "on_time", isFree: true },
        cancelPolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestCancellationNotifications: vi.fn(),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const appointmentProjection = {
      upsertRecordFromProjection: vi.fn().mockRejectedValue(
        Object.assign(new Error("appointment_records_status_check"), { code: "23514" }),
      ),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      appointmentProjection: appointmentProjection as never,
      bookingScheduling: { assertSlotAvailable: vi.fn() } as never,
    });

    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
      reason: "busy",
    });
    expect(result).toMatchObject({ ok: true });
    expect(bookingsPort.markCancelled).toHaveBeenCalled();
    expect(appointmentProjection.upsertRecordFromProjection).toHaveBeenCalled();
  });

  it("cancelBooking: cancels only the selected chain appointment", async () => {
    const row = sampleRow({
      status: "confirmed",
      canonicalAppointmentId: "appt-chain-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);
    const appointmentLifecycle = {
      previewPatientCancel: vi.fn().mockResolvedValue({ ok: true, allowed: true, requiresStaffConfirmation: false }),
      patientCancel: vi.fn().mockResolvedValue({
        ok: true,
        appointment: { id: "appt-chain-1", startAt: row.slotStart, endAt: row.slotEnd },
        eligibility: { reasonCode: "on_time", isFree: true },
        cancelPolicy: { notifyPatient: false, notifyStaff: false },
      }),
      patchLatestCancellationNotifications: vi.fn(),
    };
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-chain-1", organizationId: "org-1", chainId: "chain-1",
      }),
    };
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      bookingScheduling: { assertSlotAvailable: vi.fn() } as never,
    });

    await expect(svc.cancelBooking({ userId: row.userId!, bookingId: row.id })).resolves.toMatchObject({ ok: true });

    expect(appointmentLifecycle.patientCancel).toHaveBeenCalledTimes(1);
    expect(appointmentLifecycle.patientCancel).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: "appt-chain-1" }),
    );
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: row.id, status: "cancelled" }),
    );
  });

  it("rescheduleBooking: canonical path succeeds when doctor projection reschedule fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "8442451",
      canonicalAppointmentId: "appt-1",
      bookingType: "online",
    });
    const newStart = "2026-06-10T10:00:00.000Z";
    const newEnd = "2026-06-10T11:00:00.000Z";
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.updateSlotsAfterReschedule.mockResolvedValue({
      ...row,
      slotStart: newStart,
      slotEnd: newEnd,
      status: "confirmed",
    });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      patientReschedule: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: newStart,
          endAt: newEnd,
          branchId: "branch-1",
          phoneNormalized: "+79001234567",
        },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestRescheduleNotifications: vi.fn(),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const appointmentProjection = {
      upsertRecordFromProjection: vi.fn().mockRejectedValue(
        Object.assign(new Error("appointment_records_status_check"), { code: "23514" }),
      ),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      appointmentProjection: appointmentProjection as never,
      bookingScheduling: { assertSlotAvailable: vi.fn() } as never,
    });

    const result = await svc.rescheduleBooking({
      userId: row.userId!,
      bookingId: row.id,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    expect(result).toMatchObject({ ok: true });
    expect(bookingsPort.updateSlotsAfterReschedule).toHaveBeenCalled();
    expect(appointmentProjection.upsertRecordFromProjection).toHaveBeenCalled();
  });

  it("rescheduleBooking: complete canonical in-person row uses canonical availability without legacy branch-service resolution", async () => {
    const row = sampleRow({
      status: "confirmed",
      bookingType: "in_person",
      branchServiceId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      canonicalAppointmentId: "appt-1",
    });
    const newStart = "2026-06-10T10:00:00.000Z";
    const newEnd = "2026-06-10T11:00:00.000Z";
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.updateSlotsAfterReschedule.mockResolvedValue({ ...row, slotStart: newStart, slotEnd: newEnd });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);
    const listBusyIntervals = vi.fn().mockResolvedValue([]);
    const bookingScheduling = createBookingSchedulingService({
      listBusyIntervals,
    } as never);
    const appointmentLifecycle = {
      patientReschedule: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: newStart,
          endAt: newEnd,
          branchId: "branch-1",
          serviceId: "service-1",
          specialistId: "specialist-1",
          status: "confirmed",
        },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestRescheduleNotifications: vi.fn(),
    };
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-1",
        organizationId: "org-1",
        branchId: "branch-1",
        serviceId: "service-1",
        specialistId: "specialist-1",
        roomId: "room-1",
      }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      bookingScheduling,
    });

    await expect(svc.rescheduleBooking({
      userId: row.userId!, bookingId: row.id, slotStart: newStart, slotEnd: newEnd,
    })).resolves.toMatchObject({ ok: true });

    expect(listBusyIntervals).toHaveBeenCalledWith({
      organizationId: "org-1",
      specialistId: "specialist-1",
      roomId: "room-1",
      rangeStart: newStart,
      rangeEnd: newEnd,
      excludeAppointmentId: "appt-1",
    });
    const event = syncPort.emitBookingEvent.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect(event.payload).not.toHaveProperty("branchServiceId");
  });

  it("rescheduleBooking: incomplete legacy-only in-person row fails closed without branch-service fallback", async () => {
    const row = sampleRow({
      status: "confirmed",
      bookingType: "in_person",
      branchServiceId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      canonicalAppointmentId: "appt-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    const assertSlotAvailable = vi.fn();
    const appointmentLifecycle = { patientReschedule: vi.fn() };
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-1",
        organizationId: "org-1",
        branchId: null,
        serviceId: null,
        specialistId: null,
        roomId: null,
      }),
    };
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      bookingScheduling: { assertSlotAvailable } as never,
    });

    await expect(svc.rescheduleBooking({
      userId: row.userId!,
      bookingId: row.id,
      slotStart: "2026-06-10T10:00:00.000Z",
      slotEnd: "2026-06-10T11:00:00.000Z",
    })).resolves.toEqual({ ok: false, error: "canonical_appointment_incomplete" });

    expect(assertSlotAvailable).not.toHaveBeenCalled();
    expect(appointmentLifecycle.patientReschedule).not.toHaveBeenCalled();
  });

  it("rescheduleBooking: still calls assertSlotAvailable when retired slots read source is rubitime", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
      bookingType: "online",
    });
    const newStart = "2026-06-10T10:00:00.000Z";
    const newEnd = "2026-06-10T11:00:00.000Z";
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.updateSlotsAfterReschedule.mockResolvedValue({
      ...row,
      slotStart: newStart,
      slotEnd: newEnd,
      status: "confirmed",
    });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);
    syncPort.updateRecord.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      patientReschedule: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: newStart,
          endAt: newEnd,
          branchId: "branch-1",
          phoneNormalized: "+79001234567",
        },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestRescheduleNotifications: vi.fn(),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const appointmentProjection = {
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
    };
    const assertSlotAvailable = vi.fn().mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      appointmentProjection: appointmentProjection as never,
      bookingScheduling: { assertSlotAvailable } as never,
      resolveSlotsReadSource: vi.fn().mockResolvedValue("rubitime"),
    });

    const result = await svc.rescheduleBooking({
      userId: row.userId!,
      bookingId: row.id,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    expect(result).toMatchObject({ ok: true });
    expect(assertSlotAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        slotStart: newStart,
        slotEnd: newEnd,
        excludeAppointmentId: "appt-1",
      }),
    );
  });

  it("rescheduleBooking: calls assertSlotAvailable when slots read source is canonical", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
      bookingType: "online",
    });
    const newStart = "2026-06-10T10:00:00.000Z";
    const newEnd = "2026-06-10T11:00:00.000Z";
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.updateSlotsAfterReschedule.mockResolvedValue({
      ...row,
      slotStart: newStart,
      slotEnd: newEnd,
      status: "confirmed",
    });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);
    syncPort.updateRecord.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      patientReschedule: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: newStart,
          endAt: newEnd,
          branchId: "branch-1",
          phoneNormalized: "+79001234567",
        },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestRescheduleNotifications: vi.fn(),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const appointmentProjection = {
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
    };
    const assertSlotAvailable = vi.fn().mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      appointmentProjection: appointmentProjection as never,
      bookingScheduling: { assertSlotAvailable } as never,
      resolveSlotsReadSource: vi.fn().mockResolvedValue("canonical"),
    });

    const result = await svc.rescheduleBooking({
      userId: row.userId!,
      bookingId: row.id,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    expect(result).toMatchObject({ ok: true });
    expect(assertSlotAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        slotStart: newStart,
        slotEnd: newEnd,
        excludeAppointmentId: "appt-1",
      }),
    );
  });

  it("cancelBooking: canonical path returns paymentOutcomeFailed when payment apply fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      previewPatientCancel: vi.fn().mockResolvedValue({
        ok: true,
        allowed: true,
        requiresStaffConfirmation: false,
      }),
      patientCancel: vi.fn().mockResolvedValue({
        ok: true,
        eligibility: { reasonCode: "on_time", isFree: true, decisionType: "free" },
        cancelPolicy: { notifyPatient: true, notifyStaff: true, lateCancellationBehavior: "retain_prepayment" },
      }),
      patchLatestCancellationNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const payments = {
      applyCancelPaymentOutcome: vi.fn().mockRejectedValue(new Error("payment_db")),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      payments: payments as never,
    });

    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
    });
    expect(result).toMatchObject({ ok: true, paymentOutcomeFailed: true });
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    );
  });

  it("cancelBooking: canonical path returns notificationOutcomeFailed when patch fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      previewPatientCancel: vi.fn().mockResolvedValue({
        ok: true,
        allowed: true,
        requiresStaffConfirmation: false,
      }),
      patientCancel: vi.fn().mockResolvedValue({
        ok: true,
        eligibility: { reasonCode: "on_time", isFree: true, decisionType: "free" },
        cancelPolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestCancellationNotifications: vi.fn().mockRejectedValue(new Error("patch_fail")),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
    });

    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
    });
    expect(result).toMatchObject({ ok: true, notificationOutcomeFailed: true });
  });

  it("cancelBooking: canonical path returns membershipOutcomeFailed when package apply fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      previewPatientCancel: vi.fn().mockResolvedValue({
        ok: true,
        allowed: true,
        requiresStaffConfirmation: false,
      }),
      patientCancel: vi.fn().mockResolvedValue({
        ok: true,
        eligibility: { reasonCode: "late", isFree: false, decisionType: "package_charged" },
        cancelPolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestCancellationNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const memberships = {
      applyCancelPackageOutcome: vi.fn().mockRejectedValue(new Error("package_db")),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      memberships: memberships as never,
    });

    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
    });
    expect(result).toMatchObject({ ok: true, membershipOutcomeFailed: true });
  });

  it("cancelBooking: canonical path returns productOutcomeFailed when product apply fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      previewPatientCancel: vi.fn().mockResolvedValue({
        ok: true,
        allowed: true,
        requiresStaffConfirmation: false,
      }),
      patientCancel: vi.fn().mockResolvedValue({
        ok: true,
        eligibility: { reasonCode: "late", isFree: false, decisionType: "package_charged" },
        cancelPolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestCancellationNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-1",
        organizationId: "org-1",
        attributionJson: { productPurchaseId: "prod-purchase-1" },
      }),
    };
    const products = {
      applyCancelVisitOutcome: vi.fn().mockRejectedValue(new Error("product_db")),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      products: products as never,
    });

    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
    });
    expect(result).toMatchObject({ ok: true, productOutcomeFailed: true });
  });

  it("rescheduleBooking: canonical path returns rubitimeMirrorFailed when mirror update fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    const newStart = "2026-06-10T10:00:00.000Z";
    const newEnd = "2026-06-10T11:00:00.000Z";
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.updateSlotsAfterReschedule.mockResolvedValue({
      ...row,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    syncPort.updateRecord.mockRejectedValue(new Error("network"));
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      patientReschedule: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: newStart,
          endAt: newEnd,
          branchId: null,
          specialistId: null,
          serviceId: null,
          status: "confirmed",
        },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestRescheduleNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      bookingScheduling: { assertSlotAvailable: vi.fn() } as never,
      isRubitimeBridgeEnabled: async () => true,
    });

    const result = await svc.rescheduleBooking({
      userId: row.userId!,
      bookingId: row.id,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    expect(result).toMatchObject({ ok: true, rubitimeMirrorFailed: true });
  });

  it("rescheduleBooking: skips Rubitime update when bridge is disabled", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    const newStart = "2026-06-10T10:00:00.000Z";
    const newEnd = "2026-06-10T11:00:00.000Z";
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.updateSlotsAfterReschedule.mockResolvedValue({
      ...row,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      patientReschedule: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: newStart,
          endAt: newEnd,
          branchId: null,
          specialistId: null,
          serviceId: null,
          status: "confirmed",
        },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestRescheduleNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      bookingScheduling: { assertSlotAvailable: vi.fn() } as never,
      isRubitimeBridgeEnabled: async () => false,
    });

    const result = await svc.rescheduleBooking({
      userId: row.userId!,
      bookingId: row.id,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    expect(result).toMatchObject({ ok: true });
    expect(syncPort.updateRecord).not.toHaveBeenCalled();
    expect(bookingsPort.updateSlotsAfterReschedule).toHaveBeenCalled();
  });

  it("rescheduleBooking: canonical path returns paymentOutcomeFailed when carry-over fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    const newStart = "2026-06-10T10:00:00.000Z";
    const newEnd = "2026-06-10T11:00:00.000Z";
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.updateSlotsAfterReschedule.mockResolvedValue({
      ...row,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    syncPort.updateRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      patientReschedule: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: newStart,
          endAt: newEnd,
          branchId: null,
          specialistId: null,
          serviceId: null,
          status: "confirmed",
        },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestRescheduleNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const payments = {
      recordReschedulePaymentCarryOver: vi.fn().mockRejectedValue(new Error("payment_carry")),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      bookingScheduling: { assertSlotAvailable: vi.fn() } as never,
      payments: payments as never,
    });

    const result = await svc.rescheduleBooking({
      userId: row.userId!,
      bookingId: row.id,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    expect(result).toMatchObject({ ok: true, paymentOutcomeFailed: true });
  });

  it("rescheduleBooking: canonical path returns notificationOutcomeFailed when patch fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    const newStart = "2026-06-10T10:00:00.000Z";
    const newEnd = "2026-06-10T11:00:00.000Z";
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.updateSlotsAfterReschedule.mockResolvedValue({
      ...row,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    syncPort.updateRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      patientReschedule: vi.fn().mockResolvedValue({
        ok: true,
        appointment: {
          id: "appt-1",
          startAt: newStart,
          endAt: newEnd,
          branchId: null,
          specialistId: null,
          serviceId: null,
          status: "confirmed",
        },
        reschedulePolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestRescheduleNotifications: vi.fn().mockRejectedValue(new Error("notify_fail")),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      bookingScheduling: { assertSlotAvailable: vi.fn() } as never,
    });

    const result = await svc.rescheduleBooking({
      userId: row.userId!,
      bookingId: row.id,
      slotStart: newStart,
      slotEnd: newEnd,
    });
    expect(result).toMatchObject({ ok: true, notificationOutcomeFailed: true });
  });

  it("cancelBooking: canonical path completes when Rubitime cancel fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockRejectedValue(new Error("network"));
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const appointmentLifecycle = {
      previewPatientCancel: vi.fn().mockResolvedValue({
        ok: true,
        allowed: true,
        requiresStaffConfirmation: false,
      }),
      patientCancel: vi.fn().mockResolvedValue({
        ok: true,
        eligibility: { reasonCode: "on_time", isFree: true },
        cancelPolicy: { notifyPatient: true, notifyStaff: true },
      }),
      patchLatestCancellationNotifications: vi.fn(),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
      isRubitimeBridgeEnabled: async () => true,
    });

    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
      reason: "busy",
    });
    expect(result).toMatchObject({ ok: true, rubitimeMirrorFailed: true });
    expect(appointmentLifecycle.patientCancel).toHaveBeenCalled();
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    );
    expect(appointmentLifecycle.patchLatestCancellationNotifications).toHaveBeenCalledWith(
      "appt-1",
      "org-1",
      expect.objectContaining({
        rubitime_mirror: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("cancelBooking: canonical lifecycle error returns lifecycle_failed even when Rubitime fails", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      canonicalAppointmentId: "appt-1",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancel_failed" });
    syncPort.cancelRecord.mockRejectedValue(new Error("network"));

    const appointmentLifecycle = {
      previewPatientCancel: vi.fn().mockResolvedValue({
        ok: true,
        allowed: true,
        requiresStaffConfirmation: false,
      }),
      patientCancel: vi.fn().mockResolvedValue({
        ok: false,
        error: "unexpected",
      }),
      patchLatestCancellationNotifications: vi.fn(),
    };
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      appointmentLifecycle: appointmentLifecycle as never,
    });

    const result = await svc.cancelBooking({ userId: row.userId!, bookingId: row.id });
    expect(result).toEqual({ ok: false, error: "lifecycle_failed" });
    expect(appointmentLifecycle.patchLatestCancellationNotifications).not.toHaveBeenCalled();
  });

  it("cancelBooking: repeated call is idempotent and returns already_cancelled", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, status: "cancelled" });
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
    });

    const first = await svc.cancelBooking({ userId: row.userId!, bookingId: row.id });
    const second = await svc.cancelBooking({ userId: row.userId!, bookingId: row.id });
    expect(first).toEqual({ ok: true, notificationOutcomeFailed: true });
    expect(second).toEqual({ ok: false, error: "already_cancelled" });
  });

  it("cancelBooking: already cancelled returns already_cancelled", async () => {
    const row = sampleRow({ status: "cancelled" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
    });
    const result = await svc.cancelBooking({ userId: row.userId!, bookingId: row.id });
    expect(result).toEqual({ ok: false, error: "already_cancelled" });
    expect(bookingsPort.markCancelling).not.toHaveBeenCalled();
  });

  it("getSlots: in_person uses canonical scheduling and not integrator v2", async () => {
    const r = resolvedFixture();
    const getInPersonSlots = vi.fn().mockResolvedValue([{ date: "2026-05-01", slots: [] }]);
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: catalogWithResolve(),
      bookingEngine: bookingEngine as never,
      bookingScheduling: { getInPersonSlots } as never,
    });
    const slots = await svc.getSlots({
      type: "in_person",
      branchId: r.branch.id,
      serviceId: r.service.id,
      date: "2026-05-01",
    });
    expect(slots).toHaveLength(1);
    expect(getInPersonSlots).toHaveBeenCalledWith({
      organizationId: undefined,
      branchId: r.branch.id,
      serviceId: r.service.id,
      date: "2026-05-01",
      slotCount: undefined,
    });
    expect(syncPort.fetchSlots).not.toHaveBeenCalled();
  });

  it("cancelBooking: emit booking.cancelled includes passive v2 snapshot fields but not branchServiceId", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      bookingType: "in_person",
      branchServiceId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      cityCodeSnapshot: "moscow",
      serviceTitleSnapshot: "Сеанс",
      canonicalAppointmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: {
        getAppointment: vi.fn().mockResolvedValue({ organizationId: "org-1" }),
      } as never,
    });
    const result = await svc.cancelBooking({
      userId: row.userId!,
      bookingId: row.id,
      reason: "plan changed",
    });
    expect(result).toEqual({ ok: true });
    expect(syncPort.emitBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "booking.cancelled",
        payload: expect.objectContaining({
          organizationId: "org-1",
          cityCodeSnapshot: "moscow",
          serviceTitleSnapshot: "Сеанс",
        }),
      }),
    );
    const event = syncPort.emitBookingEvent.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect(event.payload).not.toHaveProperty("branchServiceId");
  });

  it("createBooking: inactive branch service (not found) propagates", async () => {
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const bookingScheduling = {
      assertSlotAvailable: vi.fn(),
      resolveCanonicalInPersonContext: vi.fn().mockResolvedValue(null),
    };
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: catalogWithResolve(),
      bookingEngine: bookingEngine as never,
      bookingScheduling: bookingScheduling as never,
    });
    await expect(
      svc.createBooking({
        userId: "u1111111-1111-4111-8111-111111111111",
        type: "in_person",
        branchId: "b1000000-0000-4000-8000-000000000001",
        serviceId: "51000000-0000-4000-8000-000000000002",
        cityCode: "moscow",
        slotStart: "2026-05-01T10:00:00.000Z",
        slotEnd: "2026-05-01T11:00:00.000Z",
        contactName: "T",
        contactPhone: "+7000",
      }),
    ).rejects.toThrow("branch_service_not_found");
    expect(bookingsPort.createPending).not.toHaveBeenCalled();
  });

  it("createBooking: in_person rejects cityCode that does not match catalog city", async () => {
    const r = resolvedFixture();
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
      catalog: {
        getBranch: vi.fn().mockResolvedValue({
          id: r.branch.id,
          organizationId: "org-1",
          cityCode: "msk",
          isActive: true,
        }),
      },
      services: {
        getService: vi.fn().mockResolvedValue({
          id: r.service.id,
          organizationId: "org-1",
          title: r.service.title,
          durationMinutes: r.service.durationMinutes,
          priceMinor: r.service.priceMinor,
          isActive: true,
        }),
      },
    };
    const bookingScheduling = {
      assertSlotAvailable: vi.fn(),
      resolveCanonicalInPersonContext: vi.fn().mockResolvedValue({
        organizationId: "org-1",
        branchId: r.branch.id,
        specialistId: r.specialist.id,
        serviceId: r.service.id,
        roomId: null,
      }),
    };
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: catalogWithResolve(),
      bookingEngine: bookingEngine as never,
      bookingScheduling: bookingScheduling as never,
    });
    await expect(
      svc.createBooking({
        userId: "u1111111-1111-4111-8111-111111111111",
        type: "in_person",
        branchId: "b1000000-0000-4000-8000-000000000001",
        serviceId: "51000000-0000-4000-8000-000000000002",
        cityCode: "spb",
        slotStart: "2026-05-01T10:00:00.000Z",
        slotEnd: "2026-05-01T11:00:00.000Z",
        contactName: "T",
        contactPhone: "+7000",
      }),
    ).rejects.toThrow("city_mismatch");
    expect(bookingsPort.createPending).not.toHaveBeenCalled();
    expect(syncPort.createRecord).not.toHaveBeenCalled();
  });

  it("getSlots: caches result within TTL (single fetch)", async () => {
    const getOnlineSlots = vi.fn().mockResolvedValue([{ date: "2026-05-01", slots: [] }]);
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
    };
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      bookingScheduling: { getOnlineSlots } as never,
      slotsTtlMs: 60_000,
    });
    await svc.getSlots({ type: "online", organizationId: "org-1", category: "general" });
    await svc.getSlots({ type: "online", organizationId: "org-1", category: "general" });
    expect(getOnlineSlots).toHaveBeenCalledTimes(1);
  });

  it("createBooking: success invalidates slots cache so next getSlots refetches", async () => {
    const pending = sampleRow({ id: "p-cache", status: "creating", rubitimeId: null });
    const confirmed = { ...pending, status: "confirmed" as const, canonicalAppointmentId: "appt-1" };
    bookingsPort.createPending.mockResolvedValue(pending);
    bookingsPort.markConfirmed.mockResolvedValue(confirmed);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);
    const getOnlineSlots = vi.fn().mockResolvedValue([{ date: "2026-05-01", slots: [] }]);
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
      createAppointment: vi.fn().mockResolvedValue({ id: "appt-1" }),
      createOnlineAppointmentsIfAvailable: vi.fn().mockResolvedValue([{ id: "appt-1" }]),
      upsertRubitimeAppointmentMapping: vi.fn(),
    };
    const bookingScheduling = {
      assertSlotAvailable: vi.fn().mockResolvedValue(undefined),
      resolveInPersonContext: vi.fn(),
      getMaxConsecutiveSlotHours: vi.fn().mockResolvedValue(3),
      getOnlineSlots,
      getInPersonSlots: vi.fn(),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      bookingScheduling: bookingScheduling as never,
      isRubitimeBridgeEnabled: async () => false,
      slotsTtlMs: 60_000,
    });
    await svc.getSlots({ type: "online", organizationId: "org-1", category: "general" });
    await svc.getSlots({ type: "online", organizationId: "org-1", category: "general" });
    expect(getOnlineSlots).toHaveBeenCalledTimes(1);

    await svc.createBooking({
      userId: pending.userId!,
      type: "online",
      organizationId: "org-1",
      category: "general",
      slotStart: pending.slotStart,
      slotEnd: pending.slotEnd,
      contactName: pending.contactName,
      contactPhone: pending.contactPhone,
    });

    await svc.getSlots({ type: "online", organizationId: "org-1", category: "general" });
    expect(getOnlineSlots).toHaveBeenCalledTimes(2);
  });

  it("createBooking: uses canonical path when bookingEngine and scheduling are wired", async () => {
    const pending = sampleRow({ id: "p-can", status: "creating", rubitimeId: null });
    const confirmed = { ...pending, status: "confirmed" as const, canonicalAppointmentId: "appt-1" };
    bookingsPort.createPending.mockResolvedValue(pending);
    bookingsPort.markConfirmed.mockResolvedValue(confirmed);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
      createAppointment: vi.fn().mockResolvedValue({ id: "appt-1" }),
      createOnlineAppointmentsIfAvailable: vi.fn().mockResolvedValue([{ id: "appt-1" }]),
      upsertRubitimeAppointmentMapping: vi.fn(),
    };
    const bookingScheduling = {
      assertSlotAvailable: vi.fn().mockResolvedValue(undefined),
      resolveInPersonContext: vi.fn(),
      getMaxConsecutiveSlotHours: vi.fn().mockResolvedValue(3),
      getOnlineSlots: vi.fn(),
      getInPersonSlots: vi.fn(),
    };
    const bookingForm = {
      validateAnswers: vi.fn().mockResolvedValue({ ok: true }),
      saveForAppointment: vi.fn(),
    };

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      bookingScheduling: bookingScheduling as never,
      bookingForm: bookingForm as never,
      isRubitimeBridgeEnabled: async () => false,
    });

    const result = await svc.createBooking({
      userId: pending.userId!,
      type: "online",
      organizationId: "org-1",
      category: "general",
      slotStart: pending.slotStart,
      slotEnd: pending.slotEnd,
      contactName: pending.contactName,
      contactPhone: pending.contactPhone,
    });

    expect(bookingEngine.createOnlineAppointmentsIfAvailable).toHaveBeenCalled();
    expect(bookingEngine.createAppointment).not.toHaveBeenCalled();
    expect(syncPort.createRecord).not.toHaveBeenCalled();
    expect(result.canonicalAppointmentId).toBe("appt-1");
  });

  it("createBooking: concurrent same slot second call throws slot_overlap before second createPending", async () => {
    const pending = sampleRow({ id: "p-conc", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    let release!: () => void;
    const bookingEngine = {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", organizationId: "org-1" }),
      createAppointment: vi.fn(
        () =>
          new Promise<{ id: string }>((resolve) => {
            release = () => resolve({ id: "appt-1" });
          }),
      ),
      createOnlineAppointmentsIfAvailable: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Array<{ id: string }>>((resolve) => {
              release = () => resolve([{ id: "appt-1" }]);
            }),
        )
        .mockRejectedValueOnce(new Error("slot_overlap")),
      upsertRubitimeAppointmentMapping: vi.fn(),
    };
    const bookingScheduling = {
      assertSlotAvailable: vi.fn().mockResolvedValue(undefined),
      resolveInPersonContext: vi.fn(),
      getMaxConsecutiveSlotHours: vi.fn().mockResolvedValue(3),
      getOnlineSlots: vi.fn(),
      getInPersonSlots: vi.fn(),
    };
    bookingsPort.markConfirmed.mockResolvedValue({ ...pending, status: "confirmed", canonicalAppointmentId: "appt-1" });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      bookingEngine: bookingEngine as never,
      bookingScheduling: bookingScheduling as never,
      isRubitimeBridgeEnabled: async () => false,
    });
    const payload = {
      userId: pending.userId!,
      type: "online" as const,
      organizationId: "org-1",
      category: "general" as const,
      slotStart: pending.slotStart,
      slotEnd: pending.slotEnd,
      contactName: pending.contactName,
      contactPhone: pending.contactPhone,
    };
    const first = svc.createBooking(payload);
    await expect(svc.createBooking(payload)).rejects.toThrow("slot_overlap");
    expect(bookingsPort.createPending).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(bookingsPort.createPending).toHaveBeenCalledTimes(1);
  });
});
