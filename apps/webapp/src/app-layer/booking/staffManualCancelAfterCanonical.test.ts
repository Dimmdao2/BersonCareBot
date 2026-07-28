import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyStaffCancelSideEffectsMock = vi.hoisted(() => vi.fn());
const createBookingSyncPortMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('@/app-layer/booking/staffAppointmentLifecycleEffects', () => ({
  applyStaffCancelSideEffects: applyStaffCancelSideEffectsMock,
}));

vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: createBookingSyncPortMock,
}));

vi.mock('@/modules/booking-notifications/settings', () => ({
  loadBookingLifecycleNotificationsFromSystemSettings: vi.fn().mockResolvedValue(null),
}));

import {
  DEFAULT_CANCELLATION_POLICY,
  type CancellationPolicy,
} from '@/modules/booking-policies/types';
import { runStaffManualCancelAfterCanonical } from './staffManualCancelAfterCanonical';

const cancelPolicy = (over: Partial<CancellationPolicy> = {}): CancellationPolicy =>
  ({
    id: 'policy-cancel',
    organizationId: 'org-1',
    scopeLevel: 'organization',
    scopeEntityId: null,
    title: 'Default cancel',
    ...DEFAULT_CANCELLATION_POLICY,
    ...over,
  }) as CancellationPolicy;

const baseAppointment = {
  id: 'appt-1',
  organizationId: 'org-1',
  branchId: null,
  roomId: null,
  specialistId: null,
  serviceId: null,
  platformUserId: 'user-1',
  startAt: '2026-06-01T10:00:00.000Z',
  endAt: '2026-06-01T11:00:00.000Z',
  durationMinutes: 60,
  source: 'native' as const,
  status: 'cancelled_by_specialist' as const,
  originalStartAt: null,
  rescheduleCount: 0,
  paymentRef: null,
  packageUsageRef: null,
  phoneNormalized: '+79990001122',
  attributionJson: {},
};

describe('runStaffManualCancelAfterCanonical', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyStaffCancelSideEffectsMock.mockResolvedValue(undefined);
  });

  function deps(over: Record<string, unknown> = {}) {
    return {
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

  it('marks linked patient booking cancelled after staff cancel', async () => {
    const syncLinkedPatientBookingCancelled = vi.fn().mockResolvedValue(undefined);
    await runStaffManualCancelAfterCanonical({
      deps: deps({
        patientBooking: {
          getBookingByCanonicalAppointment: vi.fn(),
          syncLinkedPatientBookingCancelled,
        },
      }),
      organizationId: 'org-1',
      appointmentId: 'appt-1',
      actorId: 'staff-1',
      actorType: 'specialist',
      decisionType: 'free',
      reason: 'staff reason',
      appointment: baseAppointment,
      cancelPolicy: cancelPolicy(),
    });
    expect(syncLinkedPatientBookingCancelled).toHaveBeenCalledWith({
      canonicalAppointmentId: 'appt-1',
      reason: 'staff reason',
    });
  });

  it('returns membershipOutcomeFailed when package outcome apply fails', async () => {
    const flags = await runStaffManualCancelAfterCanonical({
      deps: deps({
        memberships: {
          applyCancelPackageOutcome: vi.fn().mockRejectedValue(new Error('db')),
        },
      }),
      organizationId: 'org-1',
      appointmentId: 'appt-1',
      actorId: 'staff-1',
      actorType: 'specialist',
      decisionType: 'package_charged',
      appointment: baseAppointment,
      cancelPolicy: cancelPolicy(),
    });
    expect(flags).toEqual({ membershipOutcomeFailed: true });
  });

  it('returns paymentOutcomeFailed when payment outcome apply fails', async () => {
    const flags = await runStaffManualCancelAfterCanonical({
      deps: deps({
        payments: {
          applyCancelPaymentOutcome: vi.fn().mockRejectedValue(new Error('db')),
        },
      }),
      organizationId: 'org-1',
      appointmentId: 'appt-1',
      actorId: 'staff-1',
      actorType: 'admin',
      decisionType: 'retain_prepayment',
      appointment: baseAppointment,
      cancelPolicy: cancelPolicy({ notifyPatient: false }),
    });
    expect(flags).toEqual({ paymentOutcomeFailed: true });
  });

  it('returns notificationOutcomeFailed when side effects fail', async () => {
    applyStaffCancelSideEffectsMock.mockRejectedValue(new Error('notify'));
    const flags = await runStaffManualCancelAfterCanonical({
      deps: deps(),
      organizationId: 'org-1',
      appointmentId: 'appt-1',
      actorId: 'staff-1',
      actorType: 'specialist',
      decisionType: 'free',
      appointment: baseAppointment,
      cancelPolicy: cancelPolicy(),
    });
    expect(flags).toEqual({ notificationOutcomeFailed: true });
  });
});
