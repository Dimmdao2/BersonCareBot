import { describe, expect, it, vi } from "vitest";
import { createBookingOnCanonicalEngine } from "./canonicalCreate";

// Confirmation delivery is a best-effort side effect covered by its own tests.
// Canonical booking unit tests must not call the configured SMTP relay.
vi.mock("./sendBookingConfirmationEmail", () => ({
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(false),
}));

const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function pendingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    contactName: "Иван",
    contactPhone: "+79990001122",
    contactEmail: null,
    serviceTitleSnapshot: null,
    branchTitleSnapshot: null,
    ...overrides,
  };
}

function confirmedRecord(overrides: Record<string, unknown> = {}) {
  return { ...pendingRecord(), status: "confirmed", ...overrides };
}

/** Fresh mock deps per call; spread-override a slice (e.g. `{ ...deps(), clientHistory }`) per test. */
function deps() {
  const bookingsPort = {
    createPending: vi.fn().mockResolvedValue(pendingRecord()),
    markConfirmed: vi.fn().mockResolvedValue(confirmedRecord()),
    markFailedSync: vi.fn().mockResolvedValue(undefined),
    markAwaitingPayment: vi.fn().mockResolvedValue({ ...pendingRecord(), status: "awaiting_payment" }),
  };
  const bookingEngine = {
    catalog: {
      getBranch: vi.fn().mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID, isActive: true, cityCode: "moscow", title: "Москва" }),
    },
    services: {
      getService: vi.fn().mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID, isActive: true, title: "Приём", durationMinutes: 60, priceMinor: 1000, bufferAfterMinutes: 0 }),
    },
    createAppointment: vi.fn().mockResolvedValue({ id: "appt-1", startAt: "2026-06-01T10:00:00.000Z", endAt: "2026-06-01T11:00:00.000Z" }),
    createAppointmentChain: vi.fn().mockImplementation(async (inputs: { startAt: string; endAt: string }[]) =>
      inputs.map((input, index) => ({ ...input, id: `appt-${index + 1}` })),
    ),
    createOnlineAppointmentsIfAvailable: vi.fn().mockImplementation(async (inputs: { startAt: string; endAt: string }[]) =>
      inputs.map((input, index) => ({ ...input, id: `appt-${index + 1}` })),
    ),
    transitionAppointmentStatus: vi.fn().mockImplementation(async (input: { appointmentId: string; toStatus: string }) => ({
      id: input.appointmentId,
      status: input.toStatus,
    })),
    getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", startAt: "2026-06-01T10:00:00.000Z", endAt: "2026-06-01T11:00:00.000Z" }),
  };
  const bookingScheduling = {
    resolveCanonicalInPersonContext: vi.fn().mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID, specialistId: "sp-1", roomId: null, durationMinutes: 60, bufferAfterMinutes: 0, branchTimezone: "Europe/Moscow" }),
    assertSlotAvailable: vi.fn().mockResolvedValue(undefined),
    getMaxConsecutiveSlotHours: vi.fn().mockResolvedValue(24),
  };
  const bookingForm = {
    validateAnswers: vi.fn().mockResolvedValue({ ok: true }),
    saveForAppointment: vi.fn().mockResolvedValue(undefined),
  };
  return {
    bookingsPort,
    syncPort: { emitBookingEvent: vi.fn() },
    bookingEngine,
    bookingScheduling,
    bookingForm,
    appointmentProjection: null,
    payments: null,
    memberships: null,
    products: null,
    clientHistory: null,
  };
}

const onlineInput = {
  userId: "user-1",
  organizationId: ORG_ID,
  type: "online" as const,
  category: "general" as const,
  slotStart: "2026-06-01T10:00:00.000Z",
  slotEnd: "2026-06-01T11:00:00.000Z",
  contactName: "Иван",
  contactPhone: "+79990001122",
};

const inPersonInput = {
  userId: "user-1",
  type: "in_person" as const,
  branchId: BRANCH_ID,
  serviceId: SERVICE_ID,
  cityCode: "moscow",
  slotStart: "2026-06-01T10:00:00.000Z",
  slotEnd: "2026-06-01T11:00:00.000Z",
  contactName: "Иван",
  contactPhone: "+79990001122",
};

describe("createBookingOnCanonicalEngine", () => {
  it("creates a canonical appointment without writing a legacy patient_bookings link", async () => {
    const input = deps();
    await createBookingOnCanonicalEngine(input as never, {
      userId: "user-1", organizationId: ORG_ID, type: "in_person", branchId: BRANCH_ID, serviceId: SERVICE_ID, cityCode: "moscow",
      slotStart: "2026-06-01T10:00:00.000Z", slotEnd: "2026-06-01T11:00:00.000Z", contactName: "Иван", contactPhone: "+79990001122",
    });
    expect(input.bookingScheduling.resolveCanonicalInPersonContext).toHaveBeenCalledWith({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    expect(input.bookingsPort.createPending).toHaveBeenCalledWith(expect.objectContaining({ branchId: null, serviceId: null, branchServiceId: null }));
    expect(input.bookingEngine.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH_ID, serviceId: SERVICE_ID }));
  });

  it("rejects self-service booking when client is booking-blocked", async () => {
    const clientHistory = { assertSelfServiceBookingAllowed: vi.fn().mockRejectedValue(new Error("booking_blocked")) };
    await expect(
      createBookingOnCanonicalEngine({ ...deps(), clientHistory } as never, onlineInput),
    ).rejects.toThrow("booking_blocked");
  });

  it("F2 regression: online create keeps null specialist and still succeeds", async () => {
    const input = deps();
    const result = await createBookingOnCanonicalEngine(input as never, onlineInput);
    expect(input.bookingEngine.createOnlineAppointmentsIfAvailable).toHaveBeenCalledWith([
      expect.objectContaining({ specialistId: null }),
    ]);
    expect(result.status).toBe("confirmed");
  });

  it("F2: in-person create rejected when resolved context has no specialist (not inserted)", async () => {
    const input = deps();
    (input.bookingScheduling.resolveCanonicalInPersonContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID, specialistId: null, roomId: null, durationMinutes: 60, branchTimezone: "Europe/Moscow",
    });
    await expect(createBookingOnCanonicalEngine(input as never, inPersonInput)).rejects.toThrow("specialist_required");
    expect(input.bookingEngine.createAppointment).not.toHaveBeenCalled();
  });

  it("uses the per-visit durationMinutes on in-person create", async () => {
    const input = deps();
    (input.bookingScheduling.resolveCanonicalInPersonContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID, specialistId: "sp-1", roomId: null, durationMinutes: 30, branchTimezone: "Europe/Moscow",
    });
    await createBookingOnCanonicalEngine(input as never, inPersonInput);
    expect(input.bookingEngine.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 30 }));
  });

  it("rejects invalid form answers", async () => {
    const input = deps();
    (input.bookingForm!.validateAnswers as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: "required_field_missing" });
    await expect(
      createBookingOnCanonicalEngine(input as never, onlineInput, [{ fieldKey: "comment", value: "" }]),
    ).rejects.toThrow("required_field_missing");
  });

  it("enforces the organization consecutive-slot cap instead of a hard-coded duration", async () => {
    const input = deps();
    (input.bookingScheduling.getMaxConsecutiveSlotHours as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    await expect(
      createBookingOnCanonicalEngine(input as never, { ...onlineInput, slotEnd: "2026-06-01T12:00:00.000Z", slotCount: 2 }),
    ).rejects.toThrow("consecutive_slot_cap_exceeded");
    expect(input.bookingEngine.createOnlineAppointmentsIfAvailable).not.toHaveBeenCalled();
  });

  it("creates every chain row through the atomic chain port and rolls pending mirrors back on failure", async () => {
    const input = deps();
    (input.bookingsPort.createPending as ReturnType<typeof vi.fn>).mockImplementation(async (row: { slotStart: string }) =>
      pendingRecord({ id: `pb-${row.slotStart.slice(11, 13)}` }),
    );
    (input.bookingEngine.createOnlineAppointmentsIfAvailable as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("slot_overlap"));

    await expect(
      createBookingOnCanonicalEngine(input as never, { ...onlineInput, slotEnd: "2026-06-01T12:00:00.000Z", slotCount: 2 }),
    ).rejects.toThrow("slot_overlap");

    expect(input.bookingEngine.createAppointment).not.toHaveBeenCalled();
    expect(input.bookingEngine.createOnlineAppointmentsIfAvailable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ startAt: "2026-06-01T10:00:00.000Z", chainPosition: 0 }),
        expect.objectContaining({ startAt: "2026-06-01T11:00:00.000Z", chainPosition: 1 }),
      ]),
    );
    expect(input.bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-10");
    expect(input.bookingsPort.markFailedSync).toHaveBeenCalledWith("pb-11");
  });

  it("reserves one membership visit for every appointment in a chain", async () => {
    const input = deps();
    (input.bookingsPort.createPending as ReturnType<typeof vi.fn>).mockImplementation(async (row: { slotStart: string }) =>
      pendingRecord({ id: `pb-${row.slotStart.slice(11, 13)}` }),
    );
    (input.bookingsPort.markConfirmed as ReturnType<typeof vi.fn>).mockImplementation(async (id: string, _sourceId: unknown, options: { canonicalAppointmentId?: string }) =>
      confirmedRecord({ id, canonicalAppointmentId: options?.canonicalAppointmentId ?? null }),
    );
    const memberships = {
      listActivePackagesForBooking: vi.fn().mockResolvedValue([{ id: "pkg-1" }]),
      reserveForAppointment: vi.fn().mockResolvedValue({ id: "usage" }),
    };

    await createBookingOnCanonicalEngine(
      { ...input, memberships } as never,
      { ...inPersonInput, slotEnd: "2026-06-01T12:00:00.000Z", slotCount: 2, patientPackageId: "pkg-1" },
    );

    expect(memberships.reserveForAppointment).toHaveBeenCalledTimes(2);
    expect(memberships.reserveForAppointment).toHaveBeenNthCalledWith(1, expect.objectContaining({ appointmentId: "appt-1", patientPackageId: "pkg-1" }));
    expect(memberships.reserveForAppointment).toHaveBeenNthCalledWith(2, expect.objectContaining({ appointmentId: "appt-2", patientPackageId: "pkg-1" }));
  });

  it("auto FEFO reserves package on in-person create when no explicit package id", async () => {
    const input = deps();
    const memberships = {
      pickAutoPackageForBooking: vi.fn().mockResolvedValue({ id: "pkg-fefo" }),
      listActivePackagesForBooking: vi.fn().mockResolvedValue([{ id: "pkg-fefo" }]),
      reserveForAppointment: vi.fn().mockResolvedValue({ id: "usage-reserve" }),
    };

    await createBookingOnCanonicalEngine({ ...input, memberships } as never, inPersonInput);

    expect(memberships.pickAutoPackageForBooking).toHaveBeenCalledWith("user-1", ORG_ID, SERVICE_ID);
    expect(memberships.reserveForAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ patientPackageId: "pkg-fefo", serviceId: SERVICE_ID, appointmentId: "appt-1" }),
    );
  });

  it("canonical create cancels appointment when package reserve fails", async () => {
    const input = deps();
    const memberships = {
      listActivePackagesForBooking: vi.fn().mockResolvedValue([{ id: "pkg-1" }]),
      reserveForAppointment: vi.fn().mockRejectedValue(new Error("package_no_balance")),
    };

    await expect(
      createBookingOnCanonicalEngine({ ...input, memberships } as never, { ...inPersonInput, patientPackageId: "pkg-1" }),
    ).rejects.toThrow("package_no_balance");

    expect(input.bookingsPort.markFailedSync).toHaveBeenCalledWith("booking-1");
    expect(input.bookingEngine.transitionAppointmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: "appt-1", toStatus: "cancelled_by_specialist", payload: { source: "package_reserve_failed" } }),
    );
  });

  it("canonical create cancels appointment when product consume fails", async () => {
    const input = deps();
    const products = {
      listActivePurchasesForBooking: vi.fn().mockResolvedValue([{ id: "prod-1" }]),
      consumeVisitForAppointment: vi.fn().mockRejectedValue(new Error("product_no_visits")),
    };

    await expect(
      createBookingOnCanonicalEngine({ ...input, products } as never, { ...inPersonInput, productPurchaseId: "prod-1" }),
    ).rejects.toThrow("product_no_visits");

    expect(input.bookingsPort.markFailedSync).toHaveBeenCalledWith("booking-1");
    expect(input.bookingEngine.transitionAppointmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: "appt-1", toStatus: "cancelled_by_specialist", payload: { source: "product_consume_failed" } }),
    );
  });

  it("canonical create cancels orphan appointment when markConfirmed fails", async () => {
    const input = deps();
    (input.bookingsPort.markConfirmed as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(createBookingOnCanonicalEngine(input as never, onlineInput)).rejects.toThrow("booking_confirm_failed");

    expect(input.bookingEngine.transitionAppointmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: "appt-1", toStatus: "cancelled_by_specialist", payload: { source: "booking_confirm_failed" } }),
    );
    expect(input.bookingsPort.markFailedSync).toHaveBeenCalledWith("booking-1");
  });

  it("canonical create creates the native appointment before awaiting payment", async () => {
    const input = deps();
    const payments = {
      resolvePrepayment: vi.fn().mockResolvedValue({ required: true, amountMinor: 150000, currency: "RUB" }),
      createAppointmentPaymentIntent: vi.fn().mockResolvedValue(undefined),
    };
    (input.bookingsPort.markAwaitingPayment as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingRecord({ status: "awaiting_payment", canonicalAppointmentId: "appt-1" }),
    );

    await createBookingOnCanonicalEngine({ ...input, payments } as never, onlineInput);

    expect(input.bookingEngine.createOnlineAppointmentsIfAvailable).toHaveBeenCalled();
    expect(payments.createAppointmentPaymentIntent).toHaveBeenCalled();
    expect(input.bookingsPort.markAwaitingPayment).toHaveBeenCalledWith("booking-1", "appt-1");
  });

  it("creates a native be: doctor projection row for legacy compatibility", async () => {
    const input = deps();
    const appointmentProjection = { upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined) };
    await createBookingOnCanonicalEngine({ ...input, appointmentProjection } as never, onlineInput);
    expect(appointmentProjection.upsertRecordFromProjection).toHaveBeenCalledWith(
      expect.objectContaining({ integratorRecordId: "be:appt-1" }),
    );
  });

  it("does not upsert booking contacts equal to identity", async () => {
    const input = deps();
    const upsert = vi.fn();
    const getPlatformUserIdentityContacts = vi.fn().mockResolvedValue({ phone: "+79990001122", email: "identity@example.com" });
    await createBookingOnCanonicalEngine(
      { ...input, platformUserContacts: { upsert }, getPlatformUserIdentityContacts } as never,
      { ...onlineInput, contactEmail: "identity@example.com" },
    );
    expect(getPlatformUserIdentityContacts).toHaveBeenCalledWith("user-1");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts booking contacts that differ from identity", async () => {
    const input = deps();
    const upsert = vi.fn();
    await createBookingOnCanonicalEngine(
      { ...input, platformUserContacts: { upsert } } as never,
      { ...onlineInput, contactEmail: "alt@example.com" },
    );
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ contactType: "phone", source: "booking" }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ contactType: "email", source: "booking" }));
  });
});
