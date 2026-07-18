import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedBranchService } from "@/modules/booking-catalog/types";
import type { PatientBookingRecord } from "./types";
import { createBookingOnCanonicalEngine, type CanonicalBookingDeps } from "./canonicalCreate";

// sendBookingConfirmationEmail — best-effort side-effect, тестируется отдельно (#81).
vi.mock("./sendBookingConfirmationEmail", () => ({
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(false),
}));

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
  catalog: {
    getBranch: vi.fn(),
  },
  services: {
    getService: vi.fn(),
  },
  createAppointment: vi.fn(),
  createAppointmentChain: vi.fn(),
  upsertRubitimeAppointmentMapping: vi.fn(),
  getAppointment: vi.fn(),
  getAppointmentIdByRubitimeExternalId: vi.fn(),
  transitionAppointmentStatus: vi.fn(),
};

const bookingScheduling = {
  assertSlotAvailable: vi.fn().mockResolvedValue(undefined),
  resolveInPersonContext: vi.fn(),
  getMaxConsecutiveSlotHours: vi.fn().mockResolvedValue(3),
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
    bookingScheduling.assertSlotAvailable.mockResolvedValue(undefined);
    bookingEngine.createAppointment.mockResolvedValue({
      id: "appt-1",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
    });
    bookingEngine.createAppointmentChain.mockImplementation(async (inputs) =>
      inputs.map((input, index) => ({ ...input, id: `appt-${index + 1}` })),
    );
    bookingScheduling.getMaxConsecutiveSlotHours.mockResolvedValue(3);
    bookingEngine.getAppointment.mockResolvedValue({
      id: "appt-1",
      status: "confirmed",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
    });
    bookingEngine.getAppointmentIdByRubitimeExternalId.mockResolvedValue(null);
    bookingEngine.transitionAppointmentStatus.mockImplementation(async (input) => ({
      id: input.appointmentId,
      status: input.toStatus,
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
    }));
    bookingEngine.catalog.getBranch.mockResolvedValue({
      id: "br-1",
      organizationId: "org-1",
      title: "Филиал",
      shortTitle: null,
      color: null,
      cityCode: "msk",
      address: null,
      timezone: "Europe/Moscow",
      isActive: true,
      sortOrder: 0,
    });
    bookingEngine.services.getService.mockResolvedValue({
      id: "sv-1",
      organizationId: "org-1",
      title: "Приём",
      description: null,
      durationMinutes: 60,
      bufferAfterMinutes: 0,
      priceMinor: 0,
      isActive: true,
      prepaymentApplicable: false,
      usableInPackages: true,
      onlinePaymentApplicable: false,
      publicWidgetVisible: true,
      adminManualOnly: false,
      sortOrder: 0,
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
          organizationId: "org-1",
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
        organizationId: "org-1",
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
        organizationId: "org-1",
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

  it("does not create Rubitime record when bridge is on after R3 cutover", async () => {
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rt-99", raw: {} });

    await createBookingOnCanonicalEngine(deps(true), {
      userId: "user-1",
      organizationId: "org-1",
      type: "online",
            category: "general",
      slotStart: "2026-06-01T10:00:00.000Z",
      slotEnd: "2026-06-01T11:00:00.000Z",
      contactName: "Иван",
      contactPhone: "+79001234567",
    });

    expect(syncPort.createRecord).not.toHaveBeenCalled();
    expect(bookingEngine.upsertRubitimeAppointmentMapping).not.toHaveBeenCalled();
  });

  it("uses the per-visit durationMinutes on in-person create", async () => {
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
        breakAfterMinutes: 0,
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
      expect.objectContaining({ durationMinutes: 30 }),
    );
    expect(bookingCatalog.resolveBranchService).not.toHaveBeenCalled();
  });

  it("retired rubitime slot mode still uses native be: doctor projection", async () => {
    const appointmentProjection = { upsertRecordFromProjection: vi.fn() };
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rt-1", raw: {} });
    bookingEngine.getAppointmentIdByRubitimeExternalId.mockResolvedValue("appt-1");
    await createBookingOnCanonicalEngine(
      { ...deps(false, "rubitime"), appointmentProjection: appointmentProjection as never },
      {
        userId: "user-1",
        organizationId: "org-1",
        type: "online",
                category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      },
    );
    expect(syncPort.createRecord).not.toHaveBeenCalled();
    expect(appointmentProjection.upsertRecordFromProjection).toHaveBeenCalledWith(
      expect.objectContaining({ integratorRecordId: "be:appt-1" }),
    );
  });

  it("canonical mode without rubitime: projects doctor row under be: id", async () => {
    const appointmentProjection = { upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined) };
    await createBookingOnCanonicalEngine(
      { ...deps(false), appointmentProjection: appointmentProjection as never },
      {
        userId: "user-1",
        organizationId: "org-1",
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

  it("retired rubitime slot mode still checks canonical slot availability", async () => {
    bookingScheduling.assertSlotAvailable.mockRejectedValue(new Error("slot_unavailable"));
    syncPort.createRecord.mockResolvedValue({ rubitimeId: "rt-1", raw: {} });
    bookingEngine.getAppointmentIdByRubitimeExternalId.mockResolvedValue("appt-1");
    await expect(
      createBookingOnCanonicalEngine(deps(false, "rubitime"), {
        userId: "user-1",
        organizationId: "org-1",
        type: "online",
                category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      }),
    ).rejects.toThrow("slot_unavailable");
    expect(bookingScheduling.assertSlotAvailable).toHaveBeenCalled();
    expect(syncPort.createRecord).not.toHaveBeenCalled();
    expect(bookingEngine.createAppointment).not.toHaveBeenCalled();
  });

  it("canonical mode creates native appointment before awaiting payment", async () => {
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
    await createBookingOnCanonicalEngine(
      { ...deps(false, "rubitime"), payments: payments as never },
      {
        userId: "user-1",
        organizationId: "org-1",
        type: "online",
                category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      },
    );

    expect(syncPort.createRecord).not.toHaveBeenCalled();
    expect(bookingEngine.createAppointment).toHaveBeenCalled();
    expect(payments.createAppointmentPaymentIntent).toHaveBeenCalled();
    expect(bookingsPort.markAwaitingPayment).toHaveBeenCalledWith("pb-1", "appt-1", {
      rubitimeId: null,
      rubitimeManageUrl: null,
    });
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
        breakAfterMinutes: 0,
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

  it("canonical create cancels appointment when package reserve fails", async () => {
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
        breakAfterMinutes: 0,
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
      listActivePackagesForBooking: vi.fn().mockResolvedValue([{ id: "pkg-1" }]),
      reserveForAppointment: vi.fn().mockRejectedValue(new Error("package_no_balance")),
    };

    await expect(
      createBookingOnCanonicalEngine(
        { ...deps(false, "rubitime"), memberships: memberships as never },
        {
          userId: "user-1",
          type: "in_person",
          branchServiceId: "bs-1",
          cityCode: "msk",
          patientPackageId: "pkg-1",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
          contactName: "Иван",
          contactPhone: "+79001234567",
        },
      ),
    ).rejects.toThrow("package_no_balance");

    expect(syncPort.deleteRecord).not.toHaveBeenCalled();
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-1");
    expect(bookingEngine.transitionAppointmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: "appt-1",
        toStatus: "cancelled_by_specialist",
        payload: { source: "package_reserve_failed" },
      }),
    );
  });

  it("canonical create cancels appointment when product consume fails", async () => {
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
        breakAfterMinutes: 0,
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
    const products = {
      listActivePurchasesForBooking: vi.fn().mockResolvedValue([{ id: "prod-1" }]),
      consumeVisitForAppointment: vi.fn().mockRejectedValue(new Error("product_no_visits")),
    };

    await expect(
      createBookingOnCanonicalEngine(
        { ...deps(false, "rubitime"), products: products as never },
        {
          userId: "user-1",
          type: "in_person",
          branchServiceId: "bs-1",
          cityCode: "msk",
          productPurchaseId: "prod-1",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
          contactName: "Иван",
          contactPhone: "+79001234567",
        },
      ),
    ).rejects.toThrow("product_no_visits");

    expect(syncPort.deleteRecord).not.toHaveBeenCalled();
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-1");
    expect(bookingEngine.transitionAppointmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: "appt-1",
        toStatus: "cancelled_by_specialist",
        payload: { source: "product_consume_failed" },
      }),
    );
  });

  it("canonical create cancels orphan appointment when markConfirmed fails", async () => {
    bookingsPort.markConfirmed.mockResolvedValue(null);

    await expect(
      createBookingOnCanonicalEngine(deps(false, "rubitime"), {
        userId: "user-1",
        organizationId: "org-1",
        type: "online",
                category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      }),
    ).rejects.toThrow("booking_confirm_failed");

    expect(syncPort.deleteRecord).not.toHaveBeenCalled();
    expect(bookingEngine.transitionAppointmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: "appt-1",
        toStatus: "cancelled_by_specialist",
        payload: { source: "booking_confirm_failed" },
      }),
    );
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-1");
  });

  it("F2 regression: online create keeps null specialist and still succeeds", async () => {
    const result = await createBookingOnCanonicalEngine(deps(false), {
      userId: "user-1",
      organizationId: "org-1",
      type: "online",
            category: "general",
      slotStart: "2026-06-01T10:00:00.000Z",
      slotEnd: "2026-06-01T11:00:00.000Z",
      contactName: "Иван",
      contactPhone: "+79001234567",
    });
    expect(bookingEngine.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: null }),
    );
    expect(result.status).toBe("confirmed");
  });

  it("F2: in-person create rejected when resolved context has no specialist (not inserted)", async () => {
    bookingCatalog.resolveBranchService.mockResolvedValue({
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
        breakAfterMinutes: 0,
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
    });
    // Context resolves with a null specialist — the F2 guard must reject before insert.
    bookingScheduling.resolveInPersonContext.mockResolvedValue({
      organizationId: "org-1",
      branchId: "br-1",
      specialistId: null,
      serviceId: "sv-1",
      roomId: null,
      branchServiceId: "bs-1",
      durationMinutes: 60,
      branchTimezone: "Europe/Moscow",
    });

    await expect(
      createBookingOnCanonicalEngine(deps(false), {
        userId: "user-1",
        type: "in_person",
        branchServiceId: "bs-1",
        cityCode: "msk",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      }),
    ).rejects.toThrow("specialist_required");
    expect(bookingEngine.createAppointment).not.toHaveBeenCalled();
  });

  it("rejects invalid form answers", async () => {
    bookingForm.validateAnswers.mockResolvedValue({ ok: false, error: "required_field_missing" });

    await expect(
      createBookingOnCanonicalEngine(deps(false), {
        userId: "user-1",
        organizationId: "org-1",
        type: "online",
                category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T11:00:00.000Z",
        contactName: "Иван",
        contactPhone: "+79001234567",
      }, [{ fieldKey: "comment", value: "" }]),
    ).rejects.toThrow("required_field_missing");
  });

  it("creates every chain row through the atomic chain port and rolls pending mirrors back on failure", async () => {
    bookingsPort.createPending.mockImplementation(async (input) => ({
      ...pendingRecord(),
      id: `pb-${input.slotStart.slice(11, 13)}`,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
    }));
    bookingEngine.createAppointmentChain.mockRejectedValue({ code: "23P01" });

    await expect(
      createBookingOnCanonicalEngine(deps(false), {
        userId: "user-1",
        organizationId: "org-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T12:00:00.000Z",
        slotCount: 2,
        contactName: "Иван",
        contactPhone: "+79001234567",
      }),
    ).rejects.toThrow("slot_overlap");

    expect(bookingEngine.createAppointment).not.toHaveBeenCalled();
    expect(bookingEngine.createAppointmentChain).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ startAt: "2026-06-01T10:00:00.000Z", chainPosition: 0 }),
        expect.objectContaining({ startAt: "2026-06-01T11:00:00.000Z", chainPosition: 1 }),
      ]),
    );
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-10");
    expect(bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-11");
  });

  it("enforces the organization consecutive-slot cap instead of a hard-coded duration", async () => {
    bookingScheduling.getMaxConsecutiveSlotHours.mockResolvedValue(1);
    await expect(
      createBookingOnCanonicalEngine(deps(false), {
        userId: "user-1",
        organizationId: "org-1",
        type: "online",
        category: "general",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T12:00:00.000Z",
        slotCount: 2,
        contactName: "Иван",
        contactPhone: "+79001234567",
      }),
    ).rejects.toThrow("consecutive_slot_cap_exceeded");
    expect(bookingEngine.createAppointmentChain).not.toHaveBeenCalled();
  });

  it("reserves one membership visit for every appointment in a chain", async () => {
    bookingScheduling.resolveInPersonContext.mockResolvedValue({
      organizationId: "org-1",
      branchId: "br-1",
      specialistId: "sp-1",
      serviceId: "sv-1",
      roomId: null,
      branchServiceId: "bs-1",
      durationMinutes: 60,
      bufferAfterMinutes: 0,
      branchTimezone: "Europe/Moscow",
    });
    bookingsPort.createPending.mockImplementation(async (input) => ({
      ...pendingRecord(),
      id: `pb-${input.slotStart.slice(11, 13)}`,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
    }));
    bookingsPort.markConfirmed.mockImplementation(async (id, _rubitimeId, options) => ({
      ...pendingRecord(), id, status: "confirmed", canonicalAppointmentId: options?.canonicalAppointmentId ?? null,
    }));
    const memberships = {
      listActivePackagesForBooking: vi.fn().mockResolvedValue([{ id: "pkg-1" }]),
      reserveForAppointment: vi.fn().mockResolvedValue({ id: "usage" }),
    };

    await createBookingOnCanonicalEngine(
      { ...deps(false), memberships: memberships as never },
      {
        userId: "user-1",
        type: "in_person",
        branchServiceId: "bs-1",
        cityCode: "msk",
        slotStart: "2026-06-01T10:00:00.000Z",
        slotEnd: "2026-06-01T12:00:00.000Z",
        slotCount: 2,
        patientPackageId: "pkg-1",
        contactName: "Иван",
        contactPhone: "+79001234567",
      },
    );

    expect(memberships.reserveForAppointment).toHaveBeenCalledTimes(2);
    expect(memberships.reserveForAppointment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ appointmentId: "appt-1", patientPackageId: "pkg-1" }),
    );
    expect(memberships.reserveForAppointment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ appointmentId: "appt-2", patientPackageId: "pkg-1" }),
    );
  });
});
