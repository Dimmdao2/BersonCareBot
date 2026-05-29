import { describe, expect, it, vi } from "vitest";
import { createBookingAppointmentLifecycleService } from "./service";
import type { BeAppointment } from "@/modules/booking-engine/types";
import { DEFAULT_CANCELLATION_POLICY, DEFAULT_RESCHEDULE_POLICY } from "@/modules/booking-policies/types";

const baseAppointment: BeAppointment = {
  id: "appt-1",
  organizationId: "org-1",
  branchId: null,
  roomId: null,
  specialistId: null,
  serviceId: null,
  platformUserId: "user-1",
  startAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  endAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
  durationMinutes: 60,
  source: "native",
  status: "confirmed",
  originalStartAt: null,
  rescheduleCount: 0,
  paymentRef: null,
  packageUsageRef: null,
  phoneNormalized: "+79990001122",
  attributionJson: {},
};

describe("createBookingAppointmentLifecycleService", () => {
  it("previewPatientCancel allows free cancellation far before visit", async () => {
    const lifecyclePort = {
      getAppointment: vi.fn().mockResolvedValue(baseAppointment),
      listReschedules: vi.fn().mockResolvedValue([]),
      listCancellations: vi.fn().mockResolvedValue([]),
      applyReschedule: vi.fn(),
      applyCancellation: vi.fn(),
      patchLatestRescheduleNotifications: vi.fn(),
      patchLatestCancellationNotifications: vi.fn(),
    };
    const policies = {
      resolveCancellationPolicy: vi.fn().mockResolvedValue(DEFAULT_CANCELLATION_POLICY),
      resolveReschedulePolicy: vi.fn().mockResolvedValue(DEFAULT_RESCHEDULE_POLICY),
      listCancellationPolicies: vi.fn(),
      listReschedulePolicies: vi.fn(),
      upsertCancellationPolicy: vi.fn(),
      upsertReschedulePolicy: vi.fn(),
    };
    const service = createBookingAppointmentLifecycleService({ lifecyclePort, policies });
    const preview = await service.previewPatientCancel("appt-1", "org-1");
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.allowed).toBe(true);
      expect(preview.isFree).toBe(true);
    }
  });
});
