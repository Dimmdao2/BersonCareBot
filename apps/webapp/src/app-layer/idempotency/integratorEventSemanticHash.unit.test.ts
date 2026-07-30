import { describe, expect, it } from 'vitest';
import { computeIntegratorEventsRequestHash } from '@/app-layer/idempotency/integratorEventSemanticHash';

describe('integrator event semantic hash', () => {
  it('is stable when object keys arrive in a different order', () => {
    const first = {
      eventType: 'patient.profile.updated',
      eventId: 'event-1',
      payload: {
        userId: 'patient-1',
        profile: { firstName: 'Ada', lastName: 'Lovelace' },
      },
    };
    const reordered = {
      payload: {
        profile: { lastName: 'Lovelace', firstName: 'Ada' },
        userId: 'patient-1',
      },
      eventId: 'event-1',
      eventType: 'patient.profile.updated',
    };

    expect(computeIntegratorEventsRequestHash(reordered)).toBe(
      computeIntegratorEventsRequestHash(first),
    );
  });

  it('ignores transport volatility but preserves business payload differences', () => {
    const businessEvent = {
      eventType: 'patient.profile.updated',
      eventId: 'event-1',
      occurredAt: '2026-07-30T00:00:00.000Z',
      idempotencyKey: 'body-key-1',
      payload: { userId: 'patient-1', displayName: 'Ada Lovelace' },
    };
    const transportRetry = {
      ...businessEvent,
      occurredAt: '2026-07-30T00:01:00.000Z',
      idempotencyKey: 'body-key-2',
    };
    const differentBusinessPayload = {
      ...transportRetry,
      payload: { ...transportRetry.payload, displayName: 'Grace Hopper' },
    };
    const hash = computeIntegratorEventsRequestHash(businessEvent);

    expect(computeIntegratorEventsRequestHash(transportRetry)).toBe(hash);
    expect(computeIntegratorEventsRequestHash(differentBusinessPayload)).not.toBe(hash);
  });
});
