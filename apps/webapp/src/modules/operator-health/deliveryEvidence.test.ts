import { describe, expect, it } from 'vitest';
import {
  OLDEST_UNSENT_ALERT_SECONDS,
  buildDeliveryEvidenceLines,
  hasPositiveDeliveryEvidence,
  isOldestUnsentOverThreshold,
} from './deliveryEvidence';

describe('isOldestUnsentOverThreshold', () => {
  it('fires on the AGE of the oldest unsent item, not on queue depth', () => {
    expect(
      isOldestUnsentOverThreshold({ oldestUnsentAgeSeconds: OLDEST_UNSENT_ALERT_SECONDS + 1 }),
    ).toBe(true);
    expect(
      isOldestUnsentOverThreshold({ oldestUnsentAgeSeconds: OLDEST_UNSENT_ALERT_SECONDS }),
    ).toBe(false);
    expect(isOldestUnsentOverThreshold({ oldestUnsentAgeSeconds: null })).toBe(false);
  });
});

describe('hasPositiveDeliveryEvidence', () => {
  it('is proven when confirmed deliveries exist', () => {
    expect(
      hasPositiveDeliveryEvidence({
        confirmedDeliveries: 3,
        lastConfirmedDeliveryAt: '2026-07-26T09:00:00.000Z',
        oldestUnsentAgeSeconds: 10,
      }),
    ).toBe(true);
  });

  it('is NOT proven when nothing was confirmed while work is piling up', () => {
    expect(
      hasPositiveDeliveryEvidence({
        confirmedDeliveries: 0,
        lastConfirmedDeliveryAt: null,
        oldestUnsentAgeSeconds: 60 * 60,
      }),
    ).toBe(false);
  });

  it('tolerates a genuinely quiet day: nothing sent AND nothing waiting', () => {
    expect(
      hasPositiveDeliveryEvidence({
        confirmedDeliveries: 0,
        lastConfirmedDeliveryAt: null,
        oldestUnsentAgeSeconds: null,
      }),
    ).toBe(true);
  });
});

describe('buildDeliveryEvidenceLines', () => {
  it('carries all three numbers the digest owes the reader', () => {
    const lines = buildDeliveryEvidenceLines({
      confirmedDeliveries: 7,
      lastConfirmedDeliveryAt: '2026-07-26T09:00:00.000Z',
      oldestUnsentAgeSeconds: 3 * 60 * 60,
    });
    expect(lines[0]).toContain('Подтверждённых доставок за 24 ч: 7');
    expect(lines[1]).toContain('2026-07-26T09:00:00.000Z');
    expect(lines[2]).toContain('3 ч');
    expect(lines[2]).toContain('выше порога');
  });

  it('says NEVER rather than staying silent when nothing was ever confirmed', () => {
    const lines = buildDeliveryEvidenceLines({
      confirmedDeliveries: 0,
      lastConfirmedDeliveryAt: null,
      oldestUnsentAgeSeconds: null,
    });
    expect(lines[1]).toBe('Последняя подтверждённая доставка: НИКОГДА');
  });
});
