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
    updatePatientPackageNotes: vi.fn(),
    listPackageAppointmentSessionSources: vi.fn().mockResolvedValue([]),
    listRecalcCandidateAppointments: vi.fn().mockResolvedValue([]),
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

  it("offerCatalogPackageToPatient keeps offered package when payments disabled", async () => {
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
    });
    const payments = {
      createPackagePaymentIntent: vi.fn().mockRejectedValue(new Error("payments_disabled")),
    };
    const svc = createMembershipsService({ port, payments: payments as never, bookingEngine: null });
    const result = await svc.offerCatalogPackageToPatient({
      organizationId: "org-1",
      platformUserId: "user-1",
      subscriptionPackageId: "cat-1",
    });
    expect(result.status).toBe("offered");
    expect(payments.createPackagePaymentIntent).toHaveBeenCalled();
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

  it("createManualPatientPackage without title uses auto title", async () => {
    const port = makePort({
      createManualPatientPackage: vi.fn().mockImplementation(async (input) => ({
        ...basePkg,
        title: input.title,
      })),
    });
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    await svc.createManualPatientPackage({
      organizationId: "org-1",
      platformUserId: "user-1",
      priceMinor: 5000,
      items: [{ serviceId: "svc-1", quantity: 2 }],
    });
    expect(port.createManualPatientPackage).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/Индивидуальный|2/) }),
    );
  });

  it("listPatientPackageSessions excludes past when includePast false", async () => {
    const pastIso = new Date(Date.now() - 86400000).toISOString();
    const futureIso = new Date(Date.now() + 86400000).toISOString();
    const port = makePort({
      listPackageAppointmentSessionSources: vi.fn().mockResolvedValue([
        {
          appointmentId: "appt-past",
          startsAt: pastIso,
          endsAt: null,
          status: "confirmed",
          branchTitle: null,
          serviceTitle: "A",
          serviceId: "svc-1",
          usages: [],
        },
        {
          appointmentId: "appt-future",
          startsAt: futureIso,
          endsAt: null,
          status: "confirmed",
          branchTitle: null,
          serviceTitle: "B",
          serviceId: "svc-1",
          usages: [
            {
              id: "u1",
              patientPackageId: "pp-1",
              patientPackageItemId: "i1",
              appointmentId: "appt-future",
              usageKind: "reserve" as const,
              quantity: 1,
              comment: null,
              occurredAt: futureIso,
            },
          ],
        },
      ]),
    });
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const rows = await svc.listPatientPackageSessions("pp-1", "org-1", {
      includePast: false,
      allowPastUnlink: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.appointmentId).toBe("appt-future");
  });

  it("detachAppointmentPackage blocks past when flag off", async () => {
    const pastStart = new Date(Date.now() - 3600000).toISOString();
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-past",
        organizationId: "org-1",
        startAt: pastStart,
      }),
      getStatusBeforePackageCharge: vi.fn(),
      transitionAppointmentStatus: vi.fn(),
    };
    const port = makePort({
      listUsagesForAppointment: vi.fn().mockResolvedValue([
        {
          id: "u-res",
          patientPackageId: "pp-1",
          patientPackageItemId: "i1",
          appointmentId: "appt-past",
          usageKind: "reserve" as const,
          quantity: 1,
          comment: null,
          occurredAt: pastStart,
        },
      ]),
    });
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await expect(
      svc.detachAppointmentPackage({
        organizationId: "org-1",
        appointmentId: "appt-past",
        allowPastUnlink: false,
        freeCancelHoursBefore: 24,
        outcome: "release_reserve",
      }),
    ).rejects.toThrow("past_unlink_not_allowed");
  });

  it("detachAppointmentPackage requires confirmPastTwice when past allowed", async () => {
    const pastStart = new Date(Date.now() - 3600000).toISOString();
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-past",
        organizationId: "org-1",
        startAt: pastStart,
      }),
      getStatusBeforePackageCharge: vi.fn(),
      transitionAppointmentStatus: vi.fn(),
    };
    const port = makePort();
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await expect(
      svc.detachAppointmentPackage({
        organizationId: "org-1",
        appointmentId: "appt-past",
        allowPastUnlink: true,
        freeCancelHoursBefore: 24,
        outcome: "release_reserve",
        confirmPastTwice: false,
      }),
    ).rejects.toThrow("past_detach_confirmation_required");
  });

  it("detachAppointmentPackage requires outcome when late", async () => {
    const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const bookingEngine = {
      getAppointment: vi.fn().mockResolvedValue({
        id: "appt-late",
        organizationId: "org-1",
        startAt: futureStart,
      }),
      getStatusBeforePackageCharge: vi.fn(),
      transitionAppointmentStatus: vi.fn(),
    };
    const port = makePort({
      listUsagesForAppointment: vi.fn().mockResolvedValue([
        {
          id: "u-res",
          patientPackageId: "pp-1",
          patientPackageItemId: "i1",
          appointmentId: "appt-late",
          usageKind: "reserve" as const,
          quantity: 1,
          comment: null,
          occurredAt: new Date().toISOString(),
        },
      ]),
    });
    const svc = createMembershipsService({ port, payments: null, bookingEngine });
    await expect(
      svc.detachAppointmentPackage({
        organizationId: "org-1",
        appointmentId: "appt-late",
        allowPastUnlink: false,
        freeCancelHoursBefore: 48,
      }),
    ).rejects.toThrow("late_detach_choice_required");
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

describe("recalcPastSessionsForPackage (ST-01 bulk «Пересчитать»)", () => {
  // Package valid far into the real future so refreshPatientPackageRecord keeps it active.
  const recalcPkg: PatientPackageRecord = {
    ...basePkg,
    id: "pp-r",
    status: "active",
    soldAt: "2020-01-01T00:00:00Z",
    validFrom: "2020-01-01T00:00:00Z",
    validUntil: "2999-01-01T00:00:00Z",
    items: [{ id: "i1", serviceId: "svc-1", quantityInitial: 2, sortOrder: 0 }],
  };
  const NOW = "2100-01-01T00:00:00Z";
  const candidate = (over: {
    id: string;
    startsAt?: string;
    status?: string;
    serviceId?: string | null;
    usageRows?: Array<{ usageKind: string }>;
  }) => ({
    appointmentId: over.id,
    startsAt: over.startsAt ?? "2050-01-01T00:00:00Z",
    status: over.status ?? "completed",
    serviceId: over.serviceId === undefined ? "svc-1" : over.serviceId,
    usages: (over.usageRows ?? []).map((u, idx) => ({
      id: `${over.id}-u${idx}`,
      patientPackageId: "pp-r",
      patientPackageItemId: "i1",
      appointmentId: over.id,
      usageKind: u.usageKind,
      quantity: 1,
      comment: null,
      occurredAt: "2050-01-01T00:00:00Z",
    })),
  });

  function recalcPort(candidates: ReturnType<typeof candidate>[], over: Partial<MembershipsPort> = {}) {
    return makePort({
      getPatientPackage: vi.fn().mockResolvedValue(recalcPkg),
      listUsagesForPackage: vi.fn().mockResolvedValue([]),
      listRecalcCandidateAppointments: vi.fn().mockResolvedValue(candidates),
      ...over,
    });
  }

  it("empty window → no debit", async () => {
    const port = recalcPort([]);
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(res.debited).toHaveLength(0);
    expect(res.skipped).toHaveLength(0);
    expect(port.appendUsage).not.toHaveBeenCalled();
  });

  it("appointment before soldAt is not fetched (repo windows it) → not debited", async () => {
    // The repo already filters startsAt >= soldAt; assert the service passes the correct window.
    const port = recalcPort([]);
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(port.listRecalcCandidateAppointments).toHaveBeenCalledWith(
      expect.objectContaining({
        platformUserId: "user-1",
        serviceIds: ["svc-1"],
        soldAtIso: "2020-01-01T00:00:00Z",
        nowIso: NOW,
      }),
    );
  });

  it("already-debited appointment (linkage=consumed) is skipped → idempotent", async () => {
    const port = recalcPort([
      candidate({ id: "a-consumed", usageRows: [{ usageKind: "consume" }] }),
    ]);
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(res.debited).toHaveLength(0);
    expect(res.skipped).toEqual([
      { appointmentId: "a-consumed", serviceId: "svc-1", reason: "already_debited" },
    ]);
    expect(port.appendUsage).not.toHaveBeenCalled();
  });

  it("service outside package is skipped", async () => {
    const port = recalcPort([candidate({ id: "a-other", serviceId: "svc-OTHER" })]);
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(res.debited).toHaveLength(0);
    expect(res.skipped).toEqual([
      { appointmentId: "a-other", serviceId: "svc-OTHER", reason: "service_not_in_package" },
    ]);
  });

  it("non-eligible status (no_show / confirmed) is skipped", async () => {
    const port = recalcPort([
      candidate({ id: "a-noshow", status: "no_show" }),
      candidate({ id: "a-planned", status: "confirmed" }),
    ]);
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(res.debited).toHaveLength(0);
    expect(res.skipped.map((s) => s.reason)).toEqual(["status_not_eligible", "status_not_eligible"]);
    expect(port.appendUsage).not.toHaveBeenCalled();
  });

  it("balance exhaustion → stop at zero, no minus, surplus to outOfBalance", async () => {
    // 3 eligible visits, package has 2 sessions for svc-1.
    const port = recalcPort([
      candidate({ id: "a1", startsAt: "2050-01-01T00:00:00Z" }),
      candidate({ id: "a2", startsAt: "2050-01-02T00:00:00Z" }),
      candidate({ id: "a3", startsAt: "2050-01-03T00:00:00Z" }),
    ]);
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(res.debited.map((d) => d.appointmentId)).toEqual(["a1", "a2"]);
    expect(res.outOfBalance).toEqual([{ appointmentId: "a3", serviceId: "svc-1" }]);
    expect(port.appendUsage).toHaveBeenCalledTimes(2);
    expect(port.appendUsage).toHaveBeenCalledWith(
      expect.objectContaining({ usageKind: "consume", quantity: 1 }),
    );
  });

  it("debits ledger + links appointment + history + calendar for each debit", async () => {
    const refreshPackageCalendar = vi.fn().mockResolvedValue(undefined);
    const port = recalcPort([candidate({ id: "a1" })]);
    const svc = createMembershipsService({
      port,
      payments: null,
      bookingEngine: null,
      refreshPackageCalendar,
    });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      createdByPlatformUserId: "doc-1",
      nowIso: NOW,
    });
    expect(res.debited).toHaveLength(1);
    expect(port.appendUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        usageKind: "consume",
        appointmentId: "a1",
        createdByPlatformUserId: "doc-1",
      }),
    );
    expect(port.setAppointmentPackageUsageRef).toHaveBeenCalledWith("a1", "u-consume");
    expect(port.appendHistoryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "recalc_consumed" }),
    );
    expect(refreshPackageCalendar).toHaveBeenCalledWith("a1");
  });

  it("multiple eligible sessions within balance are all debited", async () => {
    const port = recalcPort([
      candidate({ id: "a1", startsAt: "2050-01-01T00:00:00Z" }),
      candidate({ id: "a2", startsAt: "2050-01-02T00:00:00Z" }),
    ]);
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(res.debited.map((d) => d.appointmentId)).toEqual(["a1", "a2"]);
    expect(res.outOfBalance).toHaveLength(0);
    expect(port.appendUsage).toHaveBeenCalledTimes(2);
  });

  it("second call is a no-op once sessions already consumed (idempotency)", async () => {
    // First pass debits both; simulate the ledger now carrying those consumes on re-fetch.
    const debitedUsages = [
      { id: "u1", patientPackageId: "pp-r", patientPackageItemId: "i1", appointmentId: "a1", usageKind: "consume" as const, quantity: 1, comment: null, occurredAt: "2050-01-01T00:00:00Z" },
      { id: "u2", patientPackageId: "pp-r", patientPackageItemId: "i1", appointmentId: "a2", usageKind: "consume" as const, quantity: 1, comment: null, occurredAt: "2050-01-02T00:00:00Z" },
    ];
    const port = recalcPort(
      [
        candidate({ id: "a1", usageRows: [{ usageKind: "consume" }] }),
        candidate({ id: "a2", usageRows: [{ usageKind: "consume" }] }),
      ],
      { listUsagesForPackage: vi.fn().mockResolvedValue(debitedUsages) },
    );
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(res.debited).toHaveLength(0);
    expect(res.skipped.every((s) => s.reason === "already_debited")).toBe(true);
    expect(port.appendUsage).not.toHaveBeenCalled();
  });

  it("inactive / expired package → no-op", async () => {
    const port = recalcPort([candidate({ id: "a1" })], {
      getPatientPackage: vi.fn().mockResolvedValue({ ...recalcPkg, status: "cancelled" }),
    });
    const svc = createMembershipsService({ port, payments: null, bookingEngine: null });
    const res = await svc.recalcPastSessionsForPackage({
      organizationId: "org-1",
      patientPackageId: "pp-r",
      nowIso: NOW,
    });
    expect(res.debited).toHaveLength(0);
    expect(port.listRecalcCandidateAppointments).not.toHaveBeenCalled();
  });
});
