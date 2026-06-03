import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedBranchService } from "@/modules/booking-catalog/types";
import type { PatientBookingRecord } from "./types";
import { createBookingOnCanonicalEngine, type CanonicalBookingDeps } from "./canonicalCreate";

const bookingsPort = {
  createPending: vi.fn(),
  markConfirmed: vi.fn(),
  markFailedSync: vi.fn(),
  markAwaitingPayment: vi.fn(),
};

const syncPort = {
  createRecord: vi.fn(),
  emitBookingEvent: vi.fn(),
  cancelRecord: vi.fn(),
  deleteRecord: vi.fn(),
};

const bookingEngine = {
  organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
  createAppointment: vi.fn(),
  upsertRubitimeAppointmentMapping: vi.fn(),
};

const bookingScheduling = {
  assertSlotAvailable: vi.fn().mockResolvedValue(undefined),
  resolveInPersonContext: vi.fn(),
};

const bookingForm = {
  validateAnswers: vi.fn().mockResolvedValue({ ok: true }),
  saveForAppointment: vi.fn().mockResolvedValue(undefined),
};

const bookingCatalog = {
  resolveBranchService: vi.fn(),
};

function pendingRecord(): PatientBookingRecord {
  return {
    id: "pb-1",
    userId: "user-1",
    status: "creating",
    bookingType: "online",
    city: null,
    category: "general",
    slotStart: "2026-06-01T10:00:00.000Z",
    slotEnd: "2026-06-01T11:00:00.000Z",
    contactName: "Иван",
    contactPhone: "+79001234567",
    contactEmail: null,
    branchId: null,
    serviceId: null,
    branchServiceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: null,
    priceMinorSnapshot: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
    rubitimeId: null,
    rubitimeManageUrl: null,
    canonicalAppointmentId: null,
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    reminder24hSent: false,
    reminder2hSent: false,
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function confirmedRecord(): PatientBookingRecord {
  return { ...pendingRecord(), status: "confirmed", canonicalAppointmentId: "appt-1" };
}

function deps(bridge: boolean, slotsReadSource: "rubitime" | "canonical" = "canonical"): CanonicalBookingDeps {
  return {
    bookingsPort: bookingsPort as never,
    syncPort: syncPort as never,
    bookingCatalog: bookingCatalog as never,
    bookingEngine: bookingEngine as never,
    bookingScheduling: bookingScheduling as never,
    bookingForm: bookingForm as never,
    appointmentProjection: null,
    payments: null,
    memberships: null,
    products: null,
    clientHistory: null,
    isRubitimeBridgeEnabled: async () => bridge,
    resolveSlotsReadSource: async () => slotsReadSource,
  };
}

describe("createBookingOnCanonicalEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookingsPort.createPending.mockResolvedValue(pendingRecord());
    bookingsPort.markConfirmed.mockResolvedValue(confirmedRecord());
    bookingEngine.createAppointment.mockResolvedValue({
      id: "appt-1",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
    });
  });

  it("rejects self-service booking when client is booking-blocked", async () => {
    const clientHistory = {
      assertSelfServiceBookingAllowed: vi.fn().mockRejectedValue(new Error("booking_blocked")),
    };
    await expect(
      createBookingOnCanonicalEngine(
        { ...deps(false), clientHistory: clientHistory as never },
        {
          userId: "user-1",
          type: "online",
          category: "general",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
          contactName: "Иван",
          contactPhone: "+79001234567",
        },
      ),
    ).rejects.toThrow("booking_blocked");
  });

  it("creates canonical appointment without rubitime when bridge is off", async () => {
    const upsert = vi.fn();
    const result = await createBookingOnCanonicalEngine(
      { ...deps(false), platformUserContacts: { upsert } as never },
      {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
        contactEmail: "alt@example.com",
      },
    );

    expect(bookingEngine.createAppointment).toHaveBeenCalled();
    expect(syncPort.createRecord).not.toHaveBeenCalled();
    expect(bookingsPort.markConfirmed).toHaveBeenCalledWith(
      "pb-1",
      null,
      expect.objectContaining({ canonicalAppointmentId: "appt-1" }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ contactType: "phone", source: "booking" }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ contactType: "email", source: "booking" }),
    );
    expect(result.status).toBe("confirmed");
  });

  it("does not upsert booking contacts equal to identity", async () => {
    const upsert = vi.fn();
    const getPlatformUserIdentityContacts = vi.fn().mockResolvedValue({
      phone: "+79001234567",
      email: "identity@example.com",
    });
    await createBookingOnCanonicalEngine(
      {
        ...deps(false),
        platformUserContacts: { upsert } as never,
        getPlatformUserIdentityContacts,
      },
      {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
        contactEmail: "identity@example.com",
      },
    );
    expect(getPlatformUserIdentityContacts).toHaveBeenCalledWith("user-1");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("syncs rubitime mapping when bridge is on", async () => {
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rt-99", raw: {} });

    await createBookingOnCanonicalEngine(deps(true), {
      userId: "user-1",
      type: "online",
      category: "general",
      slotStart: "2026-06-01T10:00:00.000Z",
      slotEnd: "2026-06-01T11:00:00.000Z",
      contactName: "Иван",
      contactPhone: "+79001234567",
    });

    expect(syncPort.createRecord).toHaveBeenCalled();
    expect(bookingEngine.upsertRubitimeAppointmentMapping).toHaveBeenCalledWith({
      organizationId: "org-1",
      appointmentId: "appt-1",
      rubitimeId: "rt-99",
    });
  });

  it("uses slot span for durationMinutes on in-person create", async () => {
    const resolved: ResolvedBranchService = {
      branchService: {
        id: "bs-1",
        branchId: "br-1",
        serviceId: "sv-1",
        specialistId: "sp-1",
        rubitimeServiceId: "1",
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      branch: {
        id: "br-1",
        cityId: "c-1",
        title: "Филиал",
        address: null,
        rubitimeBranchId: "1",
        timezone: "Europe/Moscow",
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      service: {
        id: "sv-1",
        title: "Приём",
        description: null,
        durationMinutes: 30,
        priceMinor: 0,
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      specialist: {
        id: "sp-1",
        branchId: "br-1",
        fullName: "Доктор",
        description: null,
        rubitimeCooperatorId: "1",
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      city: { id: "c-1", code: "msk", title: "Москва", isActive: true, sortOrder: 0, createdAt: "", updatedAt: "" },
    };
    bookingCatalog.resolveBranchService.mockResolvedValue(resolved);
    bookingScheduling.resolveInPersonContext.mockResolvedValue({
      organizationId: "org-1",
      branchId: "br-1",
      specialistId: "sp-1",
      serviceId: "sv-1",
      roomId: null,
      branchServiceId: "bs-1",
      durationMinutes: 30,
      branchTimezone: "Europe/Moscow",
    });

    await createBookingOnCanonicalEngine(deps(false), {
      userId: "user-1",
      type: "in_person",
      branchServiceId: "bs-1",
      cityCode: "msk",
      slotStart: "2026-06-01T10:00:00.000Z",
      slotEnd: "2026-06-01T11:00:00.000Z",
      contactName: "Иван",
      contactPhone: "+79001234567",
    });

    expect(bookingEngine.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 60 }),
    );
  });

  it("rubitime slot mode: fails when createRecord throws", async () => {
    syncPort.createRecord.mockRejectedValue(new Error("network"));
    await expect(
      createBookingOnCanonicalEngine(deps(false, "rubitime"), {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      }),
    ).rejects.toThrow("rubitime_sync_failed");
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-1");
    expect(bookingsPort.markConfirmed).not.toHaveBeenCalled();
  });

  it("rubitime slot mode: skips native be: doctor projection when rubitime id is set", async () => {
    const appointmentProjection = { upsertRecordFromProjection: vi.fn() };
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rt-1", raw: {} });
    await createBookingOnCanonicalEngine(
      { ...deps(false, "rubitime"), appointmentProjection: appointmentProjection as never },
      {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      },
    );
    expect(appointmentProjection.upsertRecordFromProjection).not.toHaveBeenCalled();
  });

  it("canonical mode without rubitime: projects doctor row under be: id", async () => {
    const appointmentProjection = { upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined) };
    await createBookingOnCanonicalEngine(
      { ...deps(false), appointmentProjection: appointmentProjection as never },
      {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      },
    );
    expect(appointmentProjection.upsertRecordFromProjection).toHaveBeenCalledWith(
      expect.objectContaining({ integratorRecordId: "be:appt-1" }),
    );
  });

  it("rubitime slot mode: skips assertSlotAvailable", async () => {
    bookingScheduling.assertSlotAvailable.mockRejectedValue(new Error("slot_unavailable"));
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rt-1", raw: {} });
    await createBookingOnCanonicalEngine(deps(false, "rubitime"), {
      userId: "user-1",
      type: "online",
      category: "general",
      slotStart: "2026-06-01T10:00:00.000Z",
      slotEnd: "2026-06-01T11:00:00.000Z",
      contactName: "Иван",
      contactPhone: "+79001234567",
    });
    expect(bookingScheduling.assertSlotAvailable).not.toHaveBeenCalled();
    expect(syncPort.createRecord).toHaveBeenCalled();
    expect(bookingEngine.createAppointment).toHaveBeenCalled();
  });

  it("rubitime slot mode: fails when rubitimeId is missing", async () => {
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "", raw: {} });
    await expect(
      createBookingOnCanonicalEngine(deps(false, "rubitime"), {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      }),
    ).rejects.toThrow("rubitime_id_missing");
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-1");
  });

  it("rubitime slot mode: rolls back Rubitime when canonical create fails", async () => {
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rt-rollback", raw: {} });
    bookingEngine.createAppointment.mockRejectedValue(new Error("db_fail"));
    await expect(
      createBookingOnCanonicalEngine(deps(false, "rubitime"), {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      }),
    ).rejects.toThrow("db_fail");
    expect(syncPort.deleteRecord).toHaveBeenCalledWith("rt-rollback");
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-1");
  });

  it("rubitime slot mode: creates Rubitime record before awaiting payment", async () => {
    const payments = {
      resolvePrepayment: vi.fn().mockResolvedValue({
        required: true,
        amountMinor: 150000,
        currency: "RUB",
      }),
      createAppointmentPaymentIntent: vi.fn().mockResolvedValue(undefined),
    };
    bookingsPort.markAwaitingPayment.mockResolvedValue({
      ...pendingRecord(),
      status: "awaiting_payment",
      canonicalAppointmentId: "appt-1",
    });
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rt-prepay", raw: {} });

    await createBookingOnCanonicalEngine(
      { ...deps(false, "rubitime"), payments: payments as never },
      {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      },
    );

    expect(syncPort.createRecord).toHaveBeenCalled();
    expect(bookingEngine.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ status: "awaiting_payment" }),
    );
    expect(payments.createAppointmentPaymentIntent).toHaveBeenCalled();
    expect(bookingsPort.markAwaitingPayment).toHaveBeenCalledWith("pb-1", "appt-1");
    expect(syncPort.createRecord.mock.invocationCallOrder[0]!).toBeLessThan(
      bookingsPort.markAwaitingPayment.mock.invocationCallOrder[0]!,
    );
  });

  it("auto FEFO reserves package on in-person create when no explicit package id", async () => {
    const resolved: ResolvedBranchService = {
      branchService: {
        id: "bs-1",
        branchId: "br-1",
        serviceId: "sv-1",
        specialistId: "sp-1",
        rubitimeServiceId: "1",
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      branch: {
        id: "br-1",
        cityId: "c-1",
        title: "Филиал",
        address: null,
        rubitimeBranchId: "1",
        timezone: "Europe/Moscow",
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      service: {
        id: "sv-1",
        title: "Приём",
        description: null,
        durationMinutes: 60,
        priceMinor: 0,
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      specialist: {
        id: "sp-1",
        branchId: "br-1",
        fullName: "Доктор",
        description: null,
        rubitimeCooperatorId: "1",
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      city: { id: "c-1", code: "msk", title: "Москва", isActive: true, sortOrder: 0, createdAt: "", updatedAt: "" },
    };
    bookingCatalog.resolveBranchService.mockResolvedValue(resolved);
    bookingScheduling.resolveInPersonContext.mockResolvedValue({
      organizationId: "org-1",
      branchId: "br-1",
      specialistId: "sp-1",
      serviceId: "sv-1",
      roomId: null,
      branchServiceId: "bs-1",
      durationMinutes: 60,
      branchTimezone: "Europe/Moscow",
    });
    const memberships = {
      pickAutoPackageForBooking: vi.fn().mockResolvedValue({ id: "pkg-fefo" }),
      listActivePackagesForBooking: vi.fn().mockResolvedValue([{ id: "pkg-fefo" }]),
      reserveForAppointment: vi.fn().mockResolvedValue({ id: "usage-reserve" }),
    };
    bookingEngine.getAppointment = vi.fn().mockResolvedValue({
      id: "appt-1",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
    });

    await createBookingOnCanonicalEngine(
      { ...deps(false), memberships: memberships as never },
      {
        userId: "user-1",
        type: "in_person",
        branchServiceId: "bs-1",
        cityCode: "msk",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      },
    );

    expect(memberships.pickAutoPackageForBooking).toHaveBeenCalledWith("user-1", "org-1", "sv-1");
    expect(memberships.reserveForAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        patientPackageId: "pkg-fefo",
        serviceId: "sv-1",
        appointmentId: "appt-1",
      }),
    );
  });

  it("rejects invalid form answers", async () => {
    bookingForm.validateAnswers.mockResolvedValue({ ok: false, error: "required_field_missing" });

    await expect(
      createBookingOnCanonicalEngine(deps(false), {
        userId: "user-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      }, [{ fieldKey: "comment", value: "" }]),
    ).rejects.toThrow("required_field_missing");
  });
});
