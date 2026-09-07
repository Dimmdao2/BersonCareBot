import { describe, expect, it } from 'vitest';
import { evaluateBookingActionEligibility } from './policyResolver';
import { DEFAULT_BOOKING_POLICY, type BookingPolicy } from './types';

const policy: BookingPolicy = {
  ...DEFAULT_BOOKING_POLICY,
  organizationId: '11111111-1111-4111-8111-111111111111',
  cancellationPolicyId: null,
  reschedulePolicyId: null,
  title: 'Политика отмены и переноса',
  cancellationAllowed: false,
  rescheduleAllowed: true,
  freeChangeHoursBefore: 72,
  lateChangeBehavior: 'penalty',
};

describe('organization booking policy behavior', () => {
  it('uses independent action switches and one shared cutoff', () => {
    const now = new Date('2026-08-17T12:00:00.000Z');
    const referenceStartAt = '2026-08-19T12:00:00.000Z';

    expect(
      evaluateBookingActionEligibility({
        action: 'cancellation',
        referenceStartAt,
        policy,
        now,
      }),
    ).toMatchObject({ allowed: false, reasonCode: 'not_allowed' });
    expect(
      evaluateBookingActionEligibility({
        action: 'reschedule',
        referenceStartAt,
        policy,
        now,
      }),
    ).toMatchObject({
      allowed: true,
      isFree: false,
      decisionType: 'penalized',
      reasonCode: 'late',
    });
  });

  it('requires staff confirmation for both late actions when manual review is selected', () => {
    const manualPolicy = {
      ...policy,
      cancellationAllowed: true,
      lateChangeBehavior: 'manual_review' as const,
    };
    const input = {
      referenceStartAt: '2026-08-19T12:00:00.000Z',
      policy: manualPolicy,
      now: new Date('2026-08-17T12:00:00.000Z'),
    };

    expect(
      evaluateBookingActionEligibility({ action: 'cancellation', ...input }),
    ).toMatchObject({ requiresStaffConfirmation: true, reasonCode: 'late' });
    expect(
      evaluateBookingActionEligibility({ action: 'reschedule', ...input }),
    ).toMatchObject({ requiresStaffConfirmation: true, reasonCode: 'late' });
  });
});
