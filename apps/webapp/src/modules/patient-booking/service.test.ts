import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedBranchService } from "@/modules/booking-catalog/types";
import type { BookingCatalogService } from "@/modules/booking-catalog/service";
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

const resolveBranchServiceMock = vi.hoisted(() => vi.fn());

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
    resolveBranchService: resolveBranchServiceMock,
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
      bookingCatalog: null,
    });
    const result = await svc.cancelBooking({
      userId: row.userId!,
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
      bookingCatalog: null,
    });
    const result = await svc.cancelBooking({ userId: row.userId!, bookingId: row.id });
    expect(result).toEqual({ ok: false, error: "sync_failed" });
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: row.id,
      reason: "cancel_sync_failed",
      status: "cancel_failed",
    });
  });

  it("cancelBooking: sync failure invalidates slots cache so next getSlots refetches", async () => {
    const row = sampleRow({ status: "confirmed", rubitimeId: "r1" });
    bookingsPort.getByIdForUser.mockResolvedValue(row);
    bookingsPort.markCancelling.mockResolvedValue({ ...row, status: "cancelling" });
    syncPort.cancelRecord.mockRejectedValue(new Error("network"));
    bookingsPort.markCancelled.mockResolvedValue({ ...row, status: "cancel_failed" });
    syncPort.fetchSlots.mockResolvedValue([{ date: "2026-05-01", slots: [] }]);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      slotsTtlMs: 60_000,
    });
    await svc.getSlots({ type: "online", category: "general" });
    await svc.getSlots({ type: "online", category: "general" });
    expect(syncPort.fetchSlots).toHaveBeenCalledTimes(1);

    const result = await svc.cancelBooking({ userId: row.userId!, bookingId: row.id });
    expect(result).toEqual({ ok: false, error: "sync_failed" });

    await svc.getSlots({ type: "online", category: "general" });
    expect(syncPort.fetchSlots).toHaveBeenCalledTimes(2);
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

  it("createBooking: rubitimeId null marks failed_sync and throws rubitime_id_missing", async () => {
    const pending = sampleRow({ id: "p-miss", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockResolvedValue({ rubitimeId: null, raw: {} });

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
    });
    await expect(
      svc.createBooking({
        userId: pending.userId!,
        type: "online",
        category: "general",
        slotStart: pending.slotStart,
        slotEnd: pending.slotEnd,
        contactName: pending.contactName,
        contactPhone: pending.contactPhone,
      }),
    ).rejects.toThrow("rubitime_id_missing");
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("p-miss");
    expect(bookingsPort.markConfirmed).not.toHaveBeenCalled();
  });

  it("createBooking: rubitimeId string confirms as before", async () => {
    const pending = sampleRow({ id: "p-ok-rid", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "123", raw: {} });
    bookingsPort.markConfirmed.mockResolvedValue({ ...pending, status: "confirmed", rubitimeId: "123" });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
    });
    const row = await svc.createBooking({
      userId: pending.userId!,
      type: "online",
      category: "general",
      slotStart: pending.slotStart,
      slotEnd: pending.slotEnd,
      contactName: pending.contactName,
      contactPhone: pending.contactPhone,
    });
    expect(row.status).toBe("confirmed");
    expect(row.rubitimeId).toBe("123");
    expect(bookingsPort.markConfirmed).toHaveBeenCalledWith("p-ok-rid", "123", { rubitimeManageUrl: null });
  });

  it("createBooking: createRecord failure calls markFailedSync", async () => {
    const pending = sampleRow({ id: "p1", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockRejectedValue(new Error("rubitime down"));

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
    });
    await expect(
      svc.createBooking({
        userId: pending.userId!,
        type: "online",
        category: "general",
        slotStart: pending.slotStart,
        slotEnd: pending.slotEnd,
        contactName: pending.contactName,
        contactPhone: pending.contactPhone,
      }),
    ).rejects.toThrow("rubitime down");
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
      bookingCatalog: null,
    });
    await expect(
      svc.createBooking({
        userId: pending.userId!,
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
      bookingCatalog: null,
    });
    await expect(
      svc.createBooking({
        userId: pending.userId!,
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

  it("createBooking: in_person slot overlap rolls back rubitime and cancels pending (v2 regression)", async () => {
    const r = resolvedFixture();
    resolveBranchServiceMock.mockResolvedValue(r);
    const pending = sampleRow({
      id: "p-overlap-ip",
      status: "creating",
      rubitimeId: null,
      bookingType: "in_person",
      city: "moscow",
      branchServiceId: r.branchService.id,
    });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rub-ip", raw: {} });
    bookingsPort.markConfirmed.mockRejectedValue(new Error("slot_overlap"));
    bookingsPort.markCancelled.mockResolvedValue({ ...pending, status: "cancelled" });
    syncPort.cancelRecord.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: catalogWithResolve(),
    });
    await expect(
      svc.createBooking({
        userId: pending.userId!,
        type: "in_person",
        branchServiceId: r.branchService.id,
        cityCode: "moscow",
        slotStart: pending.slotStart,
        slotEnd: pending.slotEnd,
        contactName: pending.contactName,
        contactPhone: pending.contactPhone,
      }),
    ).rejects.toThrow("slot_overlap");
    expect(syncPort.cancelRecord).toHaveBeenCalledWith("rub-ip");
    expect(bookingsPort.markCancelled).toHaveBeenCalledWith({
      bookingId: pending.id,
      reason: "slot_overlap",
      status: "cancelled",
    });
  });

  it("getSlots: in_person calls catalog resolve and integrator v2", async () => {
    const r = resolvedFixture();
    resolveBranchServiceMock.mockResolvedValue(r);
    syncPort.fetchSlots.mockResolvedValue([{ date: "2026-05-01", slots: [] }]);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: catalogWithResolve(),
    });
    const slots = await svc.getSlots({
      type: "in_person",
      branchServiceId: r.branchService.id,
      date: "2026-05-01",
    });
    expect(slots).toHaveLength(1);
    expect(resolveBranchServiceMock).toHaveBeenCalledWith(r.branchService.id);
    expect(syncPort.fetchSlots).toHaveBeenCalledWith({
      version: "v2",
      rubitimeBranchId: "17356",
      rubitimeCooperatorId: "34729",
      rubitimeServiceId: "67591",
      slotDurationMinutes: 60,
      date: "2026-05-01",
    });
  });

  it("getSlots: in_person without catalog throws catalog_unavailable", async () => {
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
    });
    await expect(
      svc.getSlots({
        type: "in_person",
        branchServiceId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      }),
    ).rejects.toThrow("catalog_unavailable");
  });

  it("createBooking: in_person uses v2 createRecord with localBookingId", async () => {
    const r = resolvedFixture();
    resolveBranchServiceMock.mockResolvedValue(r);
    const pending = sampleRow({
      id: "p3",
      status: "creating",
      rubitimeId: null,
      bookingType: "in_person",
      city: "moscow",
      branchServiceId: r.branchService.id,
      branchId: r.branch.id,
      serviceId: r.service.id,
      cityCodeSnapshot: r.city.code,
      branchTitleSnapshot: r.branch.title,
      serviceTitleSnapshot: r.service.title,
    });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rx", raw: {} });
    bookingsPort.markConfirmed.mockResolvedValue({ ...pending, status: "confirmed", rubitimeId: "rx" });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: catalogWithResolve(),
    });
    await svc.createBooking({
      userId: pending.userId!,
      type: "in_person",
      branchServiceId: r.branchService.id,
      cityCode: "moscow",
      slotStart: pending.slotStart,
      slotEnd: pending.slotEnd,
      contactName: pending.contactName,
      contactPhone: pending.contactPhone,
    });
    expect(syncPort.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "v2",
        localBookingId: "p3",
        rubitimeBranchId: "17356",
      }),
    );
    expect(syncPort.emitBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "booking.created",
        payload: expect.objectContaining({
          branchServiceId: r.branchService.id,
          cityCodeSnapshot: "moscow",
          serviceTitleSnapshot: "Сеанс",
        }),
      }),
    );
  });

  it("cancelBooking: emit booking.cancelled includes v2 snapshot fields for in_person", async () => {
    const row = sampleRow({
      status: "confirmed",
      rubitimeId: "r1",
      bookingType: "in_person",
      branchServiceId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      cityCodeSnapshot: "moscow",
      serviceTitleSnapshot: "Сеанс",
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
          branchServiceId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
          cityCodeSnapshot: "moscow",
          serviceTitleSnapshot: "Сеанс",
        }),
      }),
    );
  });

  it("createBooking: inactive branch service (not found) propagates", async () => {
    resolveBranchServiceMock.mockRejectedValue(new Error("branch_service_not_found"));
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: catalogWithResolve(),
    });
    await expect(
      svc.createBooking({
        userId: "u1111111-1111-4111-8111-111111111111",
        type: "in_person",
        branchServiceId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
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
    resolveBranchServiceMock.mockResolvedValue(r);
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: catalogWithResolve(),
    });
    await expect(
      svc.createBooking({
        userId: "u1111111-1111-4111-8111-111111111111",
        type: "in_person",
        branchServiceId: r.branchService.id,
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
    syncPort.fetchSlots.mockResolvedValue([{ date: "2026-05-01", slots: [] }]);
    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      slotsTtlMs: 60_000,
    });
    await svc.getSlots({ type: "online", category: "general" });
    await svc.getSlots({ type: "online", category: "general" });
    expect(syncPort.fetchSlots).toHaveBeenCalledTimes(1);
  });

  it("createBooking: success invalidates slots cache so next getSlots refetches", async () => {
    const pending = sampleRow({ id: "p-cache", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "r1", raw: {} });
    bookingsPort.markConfirmed.mockResolvedValue({ ...pending, status: "confirmed", rubitimeId: "r1" });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);
    syncPort.fetchSlots.mockResolvedValue([{ date: "2026-05-01", slots: [] }]);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
      slotsTtlMs: 60_000,
    });
    await svc.getSlots({ type: "online", category: "general" });
    await svc.getSlots({ type: "online", category: "general" });
    expect(syncPort.fetchSlots).toHaveBeenCalledTimes(1);

    await svc.createBooking({
      userId: pending.userId!,
      type: "online",
      category: "general",
      slotStart: pending.slotStart,
      slotEnd: pending.slotEnd,
      contactName: pending.contactName,
      contactPhone: pending.contactPhone,
    });

    await svc.getSlots({ type: "online", category: "general" });
    expect(syncPort.fetchSlots).toHaveBeenCalledTimes(2);
  });

  it("createBooking: concurrent same slot second call throws slot_overlap before second createPending", async () => {
    const pending = sampleRow({ id: "p-conc", status: "creating", rubitimeId: null });
    bookingsPort.createPending.mockResolvedValue(pending);
    let release!: () => void;
    syncPort.createRecord.mockImplementation(
      () =>
        new Promise<{ rubitimeId: string; raw: Record<string, unknown> }>((resolve) => {
          release = () => resolve({ rubitimeId: "r1", raw: {} });
        }),
    );
    bookingsPort.markConfirmed.mockResolvedValue({ ...pending, status: "confirmed", rubitimeId: "r1" });
    syncPort.emitBookingEvent.mockResolvedValue(undefined);

    const svc = createPatientBookingService({
      bookingsPort: bookingsPort as never,
      syncPort: syncPort as never,
      bookingCatalog: null,
    });
    const payload = {
      userId: pending.userId!,
      type: "online" as const,
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
