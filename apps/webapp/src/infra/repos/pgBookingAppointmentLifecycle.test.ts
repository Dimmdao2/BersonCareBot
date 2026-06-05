import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_RESCHEDULE_POLICY,
  type CancellationPolicy,
  type ReschedulePolicy,
} from "@/modules/booking-policies/types";

const reschedulePolicy = {
  id: "policy-reschedule",
  organizationId: "org-1",
  scopeLevel: "organization",
  scopeEntityId: null,
  title: "Default reschedule",
  ...DEFAULT_RESCHEDULE_POLICY,
} as ReschedulePolicy;

const cancellationPolicy = {
  id: "policy-cancel",
  organizationId: "org-1",
  scopeLevel: "organization",
  scopeEntityId: null,
  title: "Default cancel",
  ...DEFAULT_CANCELLATION_POLICY,
} as CancellationPolicy;

const lockedRowRef = vi.hoisted(() => ({
  value: null as Record<string, unknown> | null,
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: () => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => Promise.resolve(lockedRowRef.value ? [lockedRowRef.value] : []),
              limit: () => Promise.resolve(lockedRowRef.value ? [lockedRowRef.value] : []),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: () => Promise.resolve(),
        }),
      };
      return fn(tx);
    },
  }),
}));

import { createPgBookingAppointmentLifecyclePort } from "./pgBookingAppointmentLifecycle";

const baseRow = {
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
  source: "native",
  originalStartAt: null,
  rescheduleCount: 0,
  paymentRef: null,
  packageUsageRef: null,
  phoneNormalized: "+79990001122",
  attributionJson: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("createPgBookingAppointmentLifecyclePort", () => {
  const port = createPgBookingAppointmentLifecyclePort();

  beforeEach(() => {
    lockedRowRef.value = null;
  });

  it("applyReschedule throws state_conflict when appointment already cancelled", async () => {
    lockedRowRef.value = { ...baseRow, status: "cancelled_by_patient" };
    await expect(
      port.applyReschedule({
        appointmentId: "appt-1",
        organizationId: "org-1",
        newStartAt: "2026-06-02T10:00:00.000Z",
        newEndAt: "2026-06-02T11:00:00.000Z",
        durationMinutes: 60,
        actorType: "specialist",
        actorId: "staff-1",
        policy: reschedulePolicy,
        cancellationPolicy,
        wasInFreeRescheduleWindow: true,
        freeCancellationAvailableAtReschedule: true,
        freeCancellationAvailableAfter: true,
      }),
    ).rejects.toThrow("state_conflict");
  });

  it("applyCancellation is idempotent when target status already applied", async () => {
    lockedRowRef.value = { ...baseRow, status: "cancelled_by_patient" };
    const result = await port.applyCancellation({
      appointmentId: "appt-1",
      organizationId: "org-1",
      actorType: "patient",
      actorId: "user-1",
      policy: cancellationPolicy,
      wasFree: true,
      wasPenalized: false,
      decisionType: "free",
      targetStatus: "cancelled_by_patient",
      packageSessionCharged: false,
      prepaymentRetained: false,
      prepaymentRefunded: false,
    });
    expect(result.status).toBe("cancelled_by_patient");
  });
});
