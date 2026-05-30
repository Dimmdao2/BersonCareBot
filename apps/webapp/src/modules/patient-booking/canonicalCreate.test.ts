import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedBranchService } from "@/modules/booking-catalog/types";
import type { PatientBookingRecord } from "./types";
import { createBookingOnCanonicalEngine, type CanonicalBookingDeps } from "./canonicalCreate";

const bookingsPort = {
  createPending: vi.fn(),
  markConfirmed: vi.fn(),
  markFailedSync: vi.fn(),
};

const syncPort = {
  createRecord: vi.fn(),
  emitBookingEvent: vi.fn(),
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

function deps(bridge: boolean): CanonicalBookingDeps {
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
