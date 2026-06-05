import { beforeEach, describe, expect, it, vi } from "vitest";

const syncStaffCancelToRubitimeMock = vi.hoisted(() => vi.fn());
const applyStaffCancelSideEffectsMock = vi.hoisted(() => vi.fn());
const createBookingSyncPortMock = vi.hoisted(() => vi.fn(() => ({ cancelRecord: vi.fn() })));

vi.mock("@/app-layer/booking/staffRubitimeMirrorOutbound", () => ({
  resolveRubitimeIdForAppointment: vi.fn().mockResolvedValue("rt-1"),
  syncStaffCancelToRubitime: syncStaffCancelToRubitimeMock,
}));

vi.mock("@/app-layer/booking/staffAppointmentLifecycleEffects", () => ({
  applyStaffCancelSideEffects: applyStaffCancelSideEffectsMock,
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: createBookingSyncPortMock,
}));

vi.mock("@/modules/booking-notifications/settings", () => ({
  loadBookingLifecycleNotificationsFromSystemSettings: vi.fn().mockResolvedValue(null),
}));

import {
  DEFAULT_CANCELLATION_POLICY,
  type CancellationPolicy,
} from "@/modules/booking-policies/types";
import { runStaffManualCancelAfterCanonical } from "./staffManualCancelAfterCanonical";

const cancelPolicy = (over: Partial<CancellationPolicy> = {}): CancellationPolicy =>
  ({
    id: "policy-cancel",
    organizationId: "org-1",
    scopeLevel: "organization",
    scopeEntityId: null,
    title: "Default cancel",
    ...DEFAULT_CANCELLATION_POLICY,
    ...over,
  }) as CancellationPolicy;

const baseAppointment = {
  id: "appt-1",
  organizationId: "org-1",
  branchId: null,
  roomId: null,
  specialistId: null,
  serviceId: null,
  platformUserId: "user-1",
  startAt: "2026-06-01T10:00:00.000Z",
  endAt: "2026-06-01T11:00:00.000Z",
  durationMinutes: 60,
  source: "native" as const,
  status: "cancelled_by_specialist" as const,
  originalStartAt: null,
  rescheduleCount: 0,
  paymentRef: null,
  packageUsageRef: null,
  phoneNormalized: "+79990001122",
  attributionJson: {},
};

describe("runStaffManualCancelAfterCanonical", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncStaffCancelToRubitimeMock.mockResolvedValue(undefined);
    applyStaffCancelSideEffectsMock.mockResolvedValue(undefined);
  });

  function deps(over: Record<string, unknown> = {}) {
    return {
      rubitimeCanonicalProjection: { isBridgeEnabled: async () => true },
      patientBooking: null,
      appointmentProjection: null,
      bookingAppointmentLifecycle: { staffCancel: vi.fn() },
      systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
      memberships: null,
      payments: null,
      appointmentMirrorSync: null,
      ...over,
    } as never;
  }

  it("returns rubitimeMirrorFailed when Rubitime sync fails", async () => {
    syncStaffCancelToRubitimeMock.mockRejectedValue(new Error("network"));
    const flags = await runStaffManualCancelAfterCanonical({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: "appt-1",
      actorId: "staff-1",
      actorType: "specialist",
      decisionType: "free",
      appointment: baseAppointment,
      cancelPolicy: cancelPolicy(),
    });
    expect(flags).toEqual({ rubitimeMirrorFailed: true });
  });

  it("returns paymentOutcomeFailed when payment outcome apply fails", async () => {
    const flags = await runStaffManualCancelAfterCanonical({
      deps: deps({
        payments: {
          applyCancelPaymentOutcome: vi.fn().mockRejectedValue(new Error("db")),
        },
      }),
      organizationId: "org-1",
      appointmentId: "appt-1",
      actorId: "staff-1",
      actorType: "admin",
      decisionType: "retain_prepayment",
      appointment: baseAppointment,
      cancelPolicy: cancelPolicy({ notifyPatient: false }),
    });
    expect(flags).toEqual({ paymentOutcomeFailed: true });
  });

  it("returns notificationOutcomeFailed when side effects fail", async () => {
    applyStaffCancelSideEffectsMock.mockRejectedValue(new Error("notify"));
    const flags = await runStaffManualCancelAfterCanonical({
      deps: deps(),
      organizationId: "org-1",
      appointmentId: "appt-1",
      actorId: "staff-1",
      actorType: "specialist",
      decisionType: "free",
      appointment: baseAppointment,
      cancelPolicy: cancelPolicy(),
    });
    expect(flags).toEqual({ notificationOutcomeFailed: true });
  });

  it("skips Rubitime sync when bridge is disabled", async () => {
    const flags = await runStaffManualCancelAfterCanonical({
      deps: deps({
        rubitimeCanonicalProjection: { isBridgeEnabled: async () => false },
      }),
      organizationId: "org-1",
      appointmentId: "appt-1",
      actorId: "staff-1",
      actorType: "specialist",
      decisionType: "free",
      appointment: baseAppointment,
      cancelPolicy: cancelPolicy(),
    });
    expect(flags).toEqual({});
    expect(syncStaffCancelToRubitimeMock).not.toHaveBeenCalled();
  });
});
