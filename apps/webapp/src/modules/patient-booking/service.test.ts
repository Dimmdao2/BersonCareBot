import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientBookingRecord } from "./types";
import { createPatientBookingService } from "./service";

const bookingsPort = vi.hoisted(() => ({
  createPending: vi.fn(),
  markConfirmed: vi.fn(),
  markFailedSync: vi.fn(),
  markCancelling: vi.fn(),
  markCancelled: vi.fn(),
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
    ...over,
  };
}

describe("createPatientBookingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancelBooking: markCancelling then cancelRecord then markCancelled on success", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
    });
    const result = await svc.cancelBooking({
      userId: row.userId,
      bookingId: row.id,
      reason: "busy",
    });
    expect(result).toEqual({ ok: true });
    expect(bookingsPort.markCancelling).toHaveBeenCalledWith(row.id);
    expect(syncPort.cancelRecord).toHaveBeenCalledWith("r1");
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: row.id,
      reason: "busy",
      status: "cancelled",
    });
  });

  it("cancelBooking: sync failure sets cancel_failed", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    syncPort.cancelRecord.mockRejectedValue(new Error("network"));

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
    });
    const result = await svc.cancelBooking({ userId: row.userId, bookingId: row.id });
    expect(result).toEqual({ ok: false, error: "sync_failed" });
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: row.id,
      reason: "cancel_sync_failed",
      status: "cancel_failed",
    });
  });

  it("cancelBooking: already cancelled returns already_cancelled", async () => {
    const row = sampleRow({ status: "cancelled" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
    });
    const result = await svc.cancelBooking({ userId: row.userId, bookingId: row.id });
    expect(result).toEqual({ ok: false, error: "already_cancelled" });
    expect(bookingsPort.markCancelling).not.toHaveBeenCalled();
  });

  it("createBooking: createRecord failure calls markFailedSync", async () => {
    const pending = sampleRow({ id: "p1", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockRejectedValue(new Error("rubitime down"));

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
    });
    await expect(
      svc.createBooking({
        userId: pending.userId,
        type: "online",
        category: "general",
        slotStart: pending.slotStart,
        slotEnd: pending.slotEnd,
        contactName: pending.contactName,
        contactPhone: pending.contactPhone,
      }),
    ).rejects.toThrow("booking_sync_failed");
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("p1");
  });

  it("createBooking: markConfirmed failure does not call markFailedSync", async () => {
    const pending = sampleRow({ id: "p1", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "r1", raw: {} });
    bookingsPort.markConfirmed.mockRejectedValue(new Error("db write failed"));

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
    });
    await expect(
      svc.createBooking({
        userId: pending.userId,
        type: "online",
        category: "general",
        slotStart: pending.slotStart,
        slotEnd: pending.slotEnd,
        contactName: pending.contactName,
        contactPhone: pending.contactPhone,
      }),
    ).rejects.toThrow("booking_confirm_failed");
    expect(bookingsPort.markFailedSync).not.toHaveBeenCalled();
  });

  it("createBooking: slot overlap cancels remote rubitime record and local pending booking", async () => {
    const pending = sampleRow({ id: "p2", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rub-2", raw: {} });
    bookingsPort.markConfirmed.mockRejectedValue(new Error("slot_overlap"));
    bookingsPort.markCancelled.mockResolvedValue({ ...pending, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
    });
    await expect(
      svc.createBooking({
        userId: pending.userId,
        type: "online",
        category: "general",
        slotStart: pending.slotStart,
        slotEnd: pending.slotEnd,
        contactName: pending.contactName,
        contactPhone: pending.contactPhone,
      }),
    ).rejects.toThrow("slot_overlap");
    expect(syncPort.cancelRecord).toHaveBeenCalledWith("rub-2");
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: pending.id,
      reason: "slot_overlap",
      status: "cancelled",
    });
  });
});
