import { describe, expect, it, vi } from "vitest";
import { createMembershipsService } from "./service";
import type { MembershipsPort } from "./ports";
import type { PatientPackageRecord } from "./types";

const basePkg: PatientPackageRecord = {
  id: "pp-1",
  organizationId: "org-1",
  platformUserId: "user-1",
  subscriptionPackageId: null,
  status: "active",
  title: "Test",
  priceMinor: 10000,
  currency: "RUB",
  validityDays: 30,
  validFrom: "2026-01-01T00:00:00Z",
  validUntil: "2026-02-01T00:00:00Z",
  deductionMode: "manual",
  paymentIntentId: null,
  paymentRef: null,
  soldAt: "2026-01-01T00:00:00Z",
  paidAmountMinor: 10000,
  paidCurrency: "RUB",
  createdAt: "2026-01-01T00:00:00Z",
  notes: null,
  items: [{ id: "i1", serviceId: "svc-1", quantityInitial: 2, sortOrder: 0 }],
};

function makePort(overrides: Partial<MembershipsPort> = {}): MembershipsPort {
  return {
    listCatalogPackages: vi.fn(),
    getCatalogPackage: vi.fn(),
    upsertCatalogPackage: vi.fn(),
    getPatientPackage: vi.fn().mockResolvedValue(basePkg),
    listPatientPackagesForUser: vi.fn(),
    listPatientPackagesForPatientIds: vi.fn(),
    createManualPatientPackage: vi.fn(),
    offerCatalogPackageToPatient: vi.fn(),
    setPatientPackageStatus: vi.fn(),
    appendUsage: vi.fn().mockImplementation(async (input) => ({
      id: `u-${input.usageKind}`,
      patientPackageId: input.patientPackageId,
      patientPackageItemId: input.patientPackageItemId,
      appointmentId: input.appointmentId ?? null,
      usageKind: input.usageKind,
      quantity: input.quantity ?? 1,
      comment: input.comment ?? null,
      occurredAt: new Date().toISOString(),
    })),
    listUsagesForPackage: vi.fn().mockResolvedValue([]),
    listUsagesForAppointment: vi.fn().mockImplementation(async (appointmentId) => {
      if (appointmentId === "appt-1") {
        return [
          {
            id: "u-res",
            patientPackageId: "pp-1",
            patientPackageItemId: "i1",
            appointmentId: "appt-1",
            usageKind: "reserve" as const,
            quantity: 1,
            comment: null,
            occurredAt: "2026-01-01T00:00:00Z",
          },
        ];
      }
      return [];
    }),
    appendHistoryEvent: vi.fn(),
    listHistoryForPackage: vi.fn().mockResolvedValue([]),
    setAppointmentPackageUsageRef: vi.fn(),
    ...overrides,
  };
}

describe("createMembershipsService", () => {
  it("consumeForAppointment releases reserve then consumes", async () => {
    const port = makePort();
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", status: "visit_confirmed", organizationId: "org-1" }),
      getStatusBeforePackageCharge: vi.fn().mockResolvedValue(null),
      transitionAppointmentStatus: vi.fn().mockResolvedValue({}),
    };
    const refreshPackageCalendar = vi.fn().mockResolvedValue(undefined);
    const svc = createMembershipsService({ port, payments: null, bookingEngine, refreshPackageCalendar });
    await svc.consumeForAppointment({ organizationId: "org-1", appointmentId: "appt-1" });
    expect(refreshPackageCalendar).toHaveBeenCalledWith("appt-1");
    expect(port.appendUsage).toHaveBeenCalledWith(expect.objectContaining({ usageKind: "release" }));
    expect(port.appendUsage).toHaveBeenCalledWith(expect.objectContaining({ usageKind: "consume" }));
    expect(bookingEngine.transitionAppointmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ toStatus: "charged_to_package" }),
    );
  });

  it("penaltyDeductForAppointment without reserve appends penalty usage", async () => {
    const activePkg = {
      ...basePkg,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
    };
    const port = makePort({
      listUsagesForAppointment: vi.fn().mockResolvedValue([]),
      listPatientPackagesForUser: vi.fn().mockResolvedValue([activePkg]),
      getPatientPackage: vi.fn().mockResolvedValue(activePkg),
    });
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-2",
        serviceId: "svc-1",
        platformUserId: "user-1",
        organizationId: "org-1",
      }),
      getStatusBeforePackageCharge: vi.fn().mockResolvedValue(null),
      transitionAppointmentStatus: vi.fn(),
    };
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await svc.penaltyDeductForAppointment({ organizationId: "org-1", appointmentId: "appt-2" });
    expect(port.appendUsage).toHaveBeenCalledWith(expect.objectContaining({ usageKind: "penalty" }));
    expect(port.setAppointmentPackageUsageRef).toHaveBeenCalledWith("appt-2", "u-penalty");
  });

  it("consumeForAppointment asPenalty does not transition appointment status", async () => {
    const port = makePort();
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", status: "late_cancellation", organizationId: "org-1" }),
      getStatusBeforePackageCharge: vi.fn().mockResolvedValue(null),
      transitionAppointmentStatus: vi.fn().mockResolvedValue({}),
    };
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await svc.consumeForAppointment({
      organizationId: "org-1",
      appointmentId: "appt-1",
      asPenalty: true,
    });
    expect(bookingEngine.transitionAppointmentStatus).not.toHaveBeenCalled();
  });

  it("onVisitConfirmed consumes when auto mode", async () => {
    const port = makePort({
      getPatientPackage: vi.fn().mockResolvedValue({ ...basePkg, deductionMode: "auto_on_visit_confirmed" }),
    });
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", status: "visit_confirmed", organizationId: "org-1" }),
      getStatusBeforePackageCharge: vi.fn().mockResolvedValue(null),
      transitionAppointmentStatus: vi.fn().mockResolvedValue({}),
    };
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    const result = await svc.onVisitConfirmed("appt-1", "org-1");
    expect(result.skipped).toBe(false);
    expect(port.appendUsage).toHaveBeenCalledWith(expect.objectContaining({ usageKind: "consume" }));
  });

  it("offerCatalogPackageToPatient with activateImmediately skips payment offer", async () => {
    const offered = {
      ...basePkg,
      status: "offered" as const,
      priceMinor: 10000,
      validFrom: null,
      validUntil: null,
    };
    const port = makePort({
      offerCatalogPackageToPatient: vi.fn().mockResolvedValue(offered),
      getPatientPackage: vi.fn().mockResolvedValue(offered),
      setPatientPackageStatus: vi.fn().mockResolvedValue({ ...offered, status: "active" }),
    });
    const payments = { createPackagePaymentIntent: vi.fn() };
    const svc = createMembershipsService({ port, payments: payments as never, bookingEngine: null });
    await svc.offerCatalogPackageToPatient({
      organizationId: "org-1",
      platformUserId: "user-1",
      subscriptionPackageId: "cat-1",
      activateImmediately: true,
      paidAmountMinor: 10000,
      soldAt: "2026-05-01T00:00:00Z",
    });
    expect(payments.createPackagePaymentIntent).not.toHaveBeenCalled();
    expect(port.setPatientPackageStatus).toHaveBeenCalledWith(
      "pp-1",
      "org-1",
      "active",
      expect.objectContaining({
        soldAt: "2026-05-01T00:00:00Z",
        paidAmountMinor: 10000,
      }),
    );
  });

  it("createManualPatientPackage staff sale skips payment offer and passes sale fields to port", async () => {
    const offered = {
      ...basePkg,
      status: "offered" as const,
      validFrom: null,
      validUntil: null,
    };
    const port = makePort({
      createManualPatientPackage: vi.fn().mockResolvedValue(offered),
      getPatientPackage: vi.fn().mockResolvedValue(offered),
      setPatientPackageStatus: vi.fn().mockResolvedValue({ ...offered, status: "active" }),
    });
    const payments = { createPackagePaymentIntent: vi.fn() };
    const svc = createMembershipsService({ port, payments: payments as never, bookingEngine: null });
    await svc.createManualPatientPackage({
      organizationId: "org-1",
      platformUserId: "user-1",
      title: "Пакет",
      priceMinor: 5000,
      items: [{ serviceId: "svc-1", quantity: 3 }],
      soldAt: "2026-05-02T00:00:00Z",
      paidAmountMinor: 5000,
      sendForPayment: false,
      activateImmediately: true,
    });
    expect(port.createManualPatientPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        soldAt: "2026-05-02T00:00:00Z",
        paidAmountMinor: 5000,
        activateImmediately: true,
      }),
    );
    expect(payments.createPackagePaymentIntent).not.toHaveBeenCalled();
  });

  it("manualConsume rejects already linked appointment", async () => {
    const port = makePort({
      listUsagesForAppointment: vi.fn().mockResolvedValue([
        {
          id: "u1",
          patientPackageId: "pp-1",
          patientPackageItemId: "i1",
          appointmentId: "appt-x",
          usageKind: "reserve" as const,
          quantity: 1,
          comment: null,
          occurredAt: "2026-01-01T00:00:00Z",
        },
      ]),
    });
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-x",
        packageUsageRef: "u1",
        status: "confirmed",
        organizationId: "org-1",
      }),
      getStatusBeforePackageCharge: vi.fn().mockResolvedValue(null),
      transitionAppointmentStatus: vi.fn(),
    };
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await expect(
      svc.manualConsume({
        organizationId: "org-1",
        patientPackageId: "pp-1",
        patientPackageItemId: "i1",
        appointmentId: "appt-x",
        createdByPlatformUserId: "doc-1",
      }),
    ).rejects.toThrow("appointment_already_linked_to_package");
  });

  it("unlinkAppointmentFromPackage releases reserve", async () => {
    const port = makePort();
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    await svc.unlinkAppointmentFromPackage({
      organizationId: "org-1",
      appointmentId: "appt-1",
    });
    expect(port.appendUsage).toHaveBeenCalledWith(expect.objectContaining({ usageKind: "release" }));
    expect(port.setAppointmentPackageUsageRef).toHaveBeenCalledWith("appt-1", null);
  });

  it("refundConsumedAppointmentPackage appends refund and clears usage ref", async () => {
    const port = makePort({
      listUsagesForAppointment: vi.fn().mockResolvedValue([
        {
          id: "u-consume",
          patientPackageId: "pp-1",
          patientPackageItemId: "i1",
          appointmentId: "appt-past",
          usageKind: "consume" as const,
          quantity: 1,
          comment: null,
          occurredAt: "2026-01-02T00:00:00Z",
        },
      ]),
    });
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    await svc.refundConsumedAppointmentPackage({
      organizationId: "org-1",
      appointmentId: "appt-past",
    });
    expect(port.appendUsage).toHaveBeenCalledWith(expect.objectContaining({ usageKind: "refund" }));
    expect(port.setAppointmentPackageUsageRef).toHaveBeenCalledWith("appt-past", null);
  });

  it("refundConsumedAppointmentPackage reverts charged_to_package using history", async () => {
    const port = makePort({
      listUsagesForAppointment: vi.fn().mockResolvedValue([
        {
          id: "u-consume",
          patientPackageId: "pp-1",
          patientPackageItemId: "i1",
          appointmentId: "appt-past",
          usageKind: "consume" as const,
          quantity: 1,
          comment: null,
          occurredAt: "2026-01-02T00:00:00Z",
        },
      ]),
    });
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-past",
        status: "charged_to_package",
        organizationId: "org-1",
      }),
      getStatusBeforePackageCharge: vi.fn().mockResolvedValue("confirmed"),
      transitionAppointmentStatus: vi.fn().mockResolvedValue({}),
    };
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await svc.refundConsumedAppointmentPackage({
      organizationId: "org-1",
      appointmentId: "appt-past",
    });
    expect(bookingEngine.transitionAppointmentStatus).toHaveBeenCalledWith({
      appointmentId: "appt-past",
      toStatus: "confirmed",
      payload: { source: "membership_refund" },
    });
  });

  it("createManualPatientPackage with zero price activates without payment offer", async () => {
    const freshPkg = {
      ...basePkg,
      priceMinor: 0,
      status: "offered" as const,
      validFrom: null,
      validUntil: null,
    };
    const port = makePort({
      createManualPatientPackage: vi.fn().mockResolvedValue(freshPkg),
      getPatientPackage: vi.fn().mockResolvedValue(freshPkg),
      setPatientPackageStatus: vi.fn().mockResolvedValue({ ...freshPkg, status: "active" }),
    });
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    await svc.createManualPatientPackage({
      organizationId: "org-1",
      platformUserId: "user-1",
      title: "Free",
      priceMinor: 0,
      items: [{ serviceId: "svc-1", quantity: 1 }],
    });
    expect(port.setPatientPackageStatus).toHaveBeenCalledWith(
      "pp-1",
      "org-1",
      "active",
      expect.any(Object),
    );
  });
});
