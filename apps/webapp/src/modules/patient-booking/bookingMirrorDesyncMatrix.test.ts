import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createPatientBookingService } from "./service";
import type { PatientBookingRecord } from "./types";
import { shouldSkipNativeReviveUpdate, upsertPatientBookingFromRubitime } from "@bersoncare/booking-rubitime-sync";
import { handleIntegratorEvent, type IntegratorEventsDeps } from "@/modules/integrator/events";

const bookingsPort = vi.hoisted(() => ({
  createPending: vi.fn(),
  markConfirmed: vi.fn(),
  markFailedSync: vi.fn(),
  markCancelling: vi.fn(),
  markCancelled: vi.fn(),
  updateSlotsAfterReschedule: vi.fn(),
  getByIdForUser: vi.fn(),
  getByCanonicalAppointmentId: vi.fn(),
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
    rubitimeManageUrl: "https://rubitime.ru/manage/r99",
    canonicalAppointmentId: "appt-1",
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...over,
  };
}

function svc() {
  return createPatientBookingService({
    bookingsPort: bookingsPort as never,
    syncPort: syncPort as never,
    bookingCatalog: null,
  });
}

describe("booking mirror desync matrix (P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1 patient cancel cabinet → markCancelled closes mirror row", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeManageUrl: "https://rubitime.ru/x" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({
      ...row,
      status: "cancelled",
      rubitimeManageUrl: null,
    });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const result = await svc().cancelBooking({ userId: row.userId!, bookingId: row.id, reason: "busy" });
    expect(result).toEqual({ ok: true });
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: row.id, status: "cancelled" }),
    );
  });

  it("2 staff cancel calendar → syncLinkedPatientBookingCancelled", async () => {
    const active = sampleRow({ status: "confirmed" });
    bookingsPort.getByCanonicalAppointmentId.mockResolvedValue(active);
    bookingsPort.markCancelled.mockResolvedValue({ ...active, status: "cancelled", rubitimeManageUrl: null });

    await svc().syncLinkedPatientBookingCancelled({
      canonicalAppointmentId: "appt-1",
      reason: "staff",
    });

    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: active.id,
      status: "cancelled",
      reason: "staff",
    });
  });

  it("2b staff sync closes row stuck in cancelling", async () => {
    const stuck = sampleRow({ status: "cancelling" });
    bookingsPort.getByCanonicalAppointmentId.mockResolvedValue(stuck);
    bookingsPort.markCancelled.mockResolvedValue({ ...stuck, status: "cancelled", rubitimeManageUrl: null });

    await svc().syncLinkedPatientBookingCancelled({ canonicalAppointmentId: "appt-1" });

    expect(bookingsPort.markCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: stuck.id, status: "cancelled" }),
    );
  });

  it("3 inbound Rubitime cancel → events route applyRubitimeUpdate with cancelled", async () => {
    const applyRubitimeUpdate = vi.fn().mockResolvedValue(undefined);
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const deps: IntegratorEventsDeps = {
      diaries: {
        createSymptomTracking: async () => ({}),
        createLfkComplex: async () => ({}),
        addLfkSession: async () => ({}),
        addSymptomEntry: async () => ({}),
      },
      appointmentProjection: mockAp,
      patientBooking: {
        getSlots: vi.fn().mockResolvedValue([]),
        createBooking: vi.fn(),
        cancelBooking: vi.fn(),
        listMyBookings: vi.fn().mockResolvedValue({ upcoming: [], history: [] }),
        applyRubitimeUpdate,
      } as never,
    };
    await handleIntegratorEvent(
      {
        eventType: "appointment.record.upserted",
        payload: {
          integratorRecordId: "8449953",
          status: "cancelled",
          recordAt: "2026-06-28T07:00:00.000Z",
          lastEvent: "event-cancel",
          updatedAt: "2026-06-28T07:00:00.000Z",
        },
      },
      deps,
    );
    expect(applyRubitimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", rubitimeId: "8449953" }),
    );
  });

  it("4 inbound remove/cancel closes rubitime_projection row and active siblings", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });
    const db = { query };
    const existingRow = {
      id: "proj-remove",
      source: "rubitime_projection" as const,
      slot_start: new Date("2026-05-01T10:00:00.000Z"),
      status: "confirmed",
      canonical_appointment_id: null,
    };
    await upsertPatientBookingFromRubitime(
      db,
      (p) => p,
      { rubitimeId: "rt-remove", status: "cancelled", slotStart: "2026-05-01T10:00:00.000Z" },
      { existingRow },
    );
    expect(String(query.mock.calls[0]?.[0])).toContain("DELETE FROM public.patient_bookings");
    expect(String(query.mock.calls[1]?.[0])).toContain("rubitime_manage_url = NULL");
  });

  it("5 rebook same slot after cancel → createPending invoked without slot_overlap", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled", rubitimeManageUrl: null });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    await svc().cancelBooking({ userId: row.userId!, bookingId: row.id });

    const pending = sampleRow({
      id: "b-new",
      status: "creating",
      rubitimeId: null,
      rubitimeManageUrl: null,
    });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "r2", raw: { link: "https://x" } });
    bookingsPort.markConfirmed.mockResolvedValue({ ...pending, status: "confirmed", rubitimeId: "r2" });

    const created = await svc().createBooking({
      userId: row.userId!,
      type: "online",
      category: "general",
      slotStart: row.slotStart,
      slotEnd: row.slotEnd,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail ?? undefined,
    });

    expect(bookingsPort.createPending).toHaveBeenCalled();
    expect(created.status).toBe("confirmed");
  });

  it("6 inbound create after prior cancel → revive guard skips upsert", async () => {
    const pool = { query: vi.fn() };
    const existingRow = {
      id: "native-cancelled",
      source: "native" as const,
      slot_start: new Date("2026-05-01T10:00:00.000Z"),
      status: "cancelled",
      canonical_appointment_id: "appt-terminal",
    };
    const skip = await shouldSkipNativeReviveUpdate(pool as never, existingRow, {
      status: "confirmed",
    });
    expect(skip).toBe(true);
  });

  it("7 partial mirror fail on cancel → local cancel still completes", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockRejectedValue(new Error("rubitime down"));

    const result = await svc().cancelBooking({ userId: row.userId!, bookingId: row.id });
    expect(result).toEqual({ ok: true, rubitimeMirrorFailed: true });
    expect(bookingsPort.markCancelled).toHaveBeenCalled();
  });
});
