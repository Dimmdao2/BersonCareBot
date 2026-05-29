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
      transitionAppointmentStatus: vi.fn().mockResolvedValue({}),
    };
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await svc.consumeForAppointment({ organizationId: "org-1", appointmentId: "appt-1" });
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
      transitionAppointmentStatus: vi.fn(),
    };
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await svc.penaltyDeductForAppointment({ organizationId: "org-1", appointmentId: "appt-2" });
    expect(port.appendUsage).toHaveBeenCalledWith(expect.objectContaining({ usageKind: "penalty" }));
  });

  it("consumeForAppointment asPenalty does not transition appointment status", async () => {
    const port = makePort();
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({ id: "appt-1", status: "late_cancellation", organizationId: "org-1" }),
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
      transitionAppointmentStatus: vi.fn().mockResolvedValue({}),
    };
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    const result = await svc.onVisitConfirmed("appt-1", "org-1");
    expect(result.skipped).toBe(false);
    expect(port.appendUsage).toHaveBeenCalledWith(expect.objectContaining({ usageKind: "consume" }));
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
