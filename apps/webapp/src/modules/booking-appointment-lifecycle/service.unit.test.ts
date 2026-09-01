import { describe, expect, it, vi } from 'vitest';
import { createBookingAppointmentLifecycleService } from './service';
import type { BeAppointment } from '@/modules/booking-engine/types';
import {
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_RESCHEDULE_POLICY,
} from '@/modules/booking-policies/types';

// W8 (SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md): restores the genuine coverage loss for
// booking appointment lifecycle. Oracle: the removed `service.test.ts`
// (commit a380533b4dca81f6502f2688881694715e1ae7bd) — `createBookingAppointmentLifecycleService`
// and `AppointmentLifecyclePort` still expose the same shape; `BeAppointment` gained three
// reminder-preset fields since (filled in below with the current fixture convention, see e.g.
// `_resolveDoctorAppointmentAccess.unit.test.ts`), but the cancellation-eligibility behavior under
// test is unchanged. Cheapest public layer: the service's own factory function, no HTTP/DB needed.
const baseAppointment: BeAppointment = {
  id: 'appt-1',
  organizationId: 'org-1',
  branchId: null,
  roomId: null,
  specialistId: null,
  serviceId: null,
  platformUserId: 'user-1',
  startAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  endAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
  durationMinutes: 60,
  source: 'native',
  status: 'confirmed',
  originalStartAt: null,
  rescheduleCount: 0,
  paymentRef: null,
  packageUsageRef: null,
  phoneNormalized: '+79990001122',
  attributionJson: {},
  appointmentReminderAllowedPresetIds: [],
  appointmentReminderPresetId: null,
  appointmentReminderSelectionSource: 'specialist_default',
};

describe('createBookingAppointmentLifecycleService', () => {
  it('previewPatientCancel allows free cancellation far before visit', async () => {
    const lifecyclePort = {
      getAppointment: vi.fn().mockResolvedValue(baseAppointment),
      listReschedules: vi.fn().mockResolvedValue([]),
      listCancellations: vi.fn().mockResolvedValue([]),
      listNoShows: vi.fn().mockResolvedValue([]),
      applyReschedule: vi.fn(),
      applyCancellation: vi.fn(),
      applyNoShow: vi.fn(),
      patchLatestRescheduleNotifications: vi.fn(),
      patchLatestCancellationNotifications: vi.fn(),
      patchLatestNoShowNotifications: vi.fn(),
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
    const preview = await service.previewPatientCancel('appt-1', 'org-1');
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.allowed).toBe(true);
      expect(preview.isFree).toBe(true);
    }
  });

  it('previewPatientCancel reports not_found for an unknown or foreign-org appointment', async () => {
    const lifecyclePort = {
      getAppointment: vi.fn().mockResolvedValue(null),
      listReschedules: vi.fn(),
      listCancellations: vi.fn(),
      listNoShows: vi.fn(),
      applyReschedule: vi.fn(),
      applyCancellation: vi.fn(),
      applyNoShow: vi.fn(),
      patchLatestRescheduleNotifications: vi.fn(),
      patchLatestCancellationNotifications: vi.fn(),
      patchLatestNoShowNotifications: vi.fn(),
    };
    const policies = {
      resolveCancellationPolicy: vi.fn(),
      resolveReschedulePolicy: vi.fn(),
      listCancellationPolicies: vi.fn(),
      listReschedulePolicies: vi.fn(),
      upsertCancellationPolicy: vi.fn(),
      upsertReschedulePolicy: vi.fn(),
    };
    const service = createBookingAppointmentLifecycleService({ lifecyclePort, policies });
    const preview = await service.previewPatientCancel('appt-missing', 'org-1');
    expect(preview).toEqual({ ok: false, error: 'not_found' });
    expect(policies.resolveCancellationPolicy).not.toHaveBeenCalled();
  });
});
