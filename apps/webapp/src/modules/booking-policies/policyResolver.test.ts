import { describe, expect, it } from 'vitest';
import {
  evaluateCancellationEligibility,
  evaluateRescheduleEligibility,
  matchesCancellationPolicy,
  matchesReschedulePolicy,
  pickHighestPriorityPolicy,
} from './policyResolver';
import {
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_RESCHEDULE_POLICY,
  type CancellationPolicy,
  type PolicyAppointmentContext,
  type ReschedulePolicy,
} from './types';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const context: PolicyAppointmentContext = {
  organizationId: ORGANIZATION_ID,
  specialistId: '22222222-2222-4222-8222-222222222222',
  serviceId: '33333333-3333-4333-8333-333333333333',
};

const cancellationPolicy: CancellationPolicy = {
  ...DEFAULT_CANCELLATION_POLICY,
  id: 'cancel-policy',
  organizationId: ORGANIZATION_ID,
  scopeLevel: 'organization',
  scopeEntityId: ORGANIZATION_ID,
  title: 'Правила отмены клиники',
};

const reschedulePolicy: ReschedulePolicy = {
  ...DEFAULT_RESCHEDULE_POLICY,
  id: 'reschedule-policy',
  organizationId: ORGANIZATION_ID,
  scopeLevel: 'organization',
  scopeEntityId: ORGANIZATION_ID,
  title: 'Правила переноса клиники',
};

describe('organization booking policy behavior', () => {
  it('selects the created organization policy and applies its free-cancellation threshold', () => {
    const selected = pickHighestPriorityPolicy(
      [cancellationPolicy],
      context,
      matchesCancellationPolicy,
    );

    expect(selected?.id).toBe('cancel-policy');
    if (!selected) throw new Error('expected cancellation policy');
    expect(
      evaluateCancellationEligibility({
        referenceStartAt: '2026-08-21T12:00:00.000Z',
        policy: selected,
        rescheduleHistory: [],
        now: new Date('2026-08-17T12:00:00.000Z'),
      }),
    ).toMatchObject({ allowed: true, isFree: true, reasonCode: 'free' });
  });

  it('selects the created organization reschedule policy and enforces its limit', () => {
    const selected = pickHighestPriorityPolicy(
      [reschedulePolicy],
      context,
      matchesReschedulePolicy,
    );

    expect(selected?.id).toBe('reschedule-policy');
    if (!selected) throw new Error('expected reschedule policy');
    expect(
      evaluateRescheduleEligibility({
        currentStartAt: '2026-08-21T12:00:00.000Z',
        policy: selected,
        rescheduleCount: 1,
        now: new Date('2026-08-17T12:00:00.000Z'),
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'limit_exceeded',
      limitExceededBehavior: 'manual_request',
      remainingSelfReschedules: 0,
    });
  });

  it('does not apply an organization policy to another clinic', () => {
    expect(
      pickHighestPriorityPolicy(
        [cancellationPolicy],
        { ...context, organizationId: '44444444-4444-4444-8444-444444444444' },
        matchesCancellationPolicy,
      ),
    ).toBeNull();
  });
});
