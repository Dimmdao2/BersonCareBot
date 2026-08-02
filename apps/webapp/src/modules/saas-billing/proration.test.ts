import { describe, expect, it } from 'vitest';
import { proratedTariffUpgradeAmountMinor } from './proration';

describe('proratedTariffUpgradeAmountMinor', () => {
  const periodStartsAt = '2026-08-01T00:00:00.000Z';
  const periodEndsAt = '2026-08-11T00:00:00.000Z';

  it('charges the full tariff difference at the first instant of a paid period', () => {
    expect(
      proratedTariffUpgradeAmountMinor({
        currentPriceMinor: 10_000,
        targetPriceMinor: 16_000,
        periodStartsAt,
        periodEndsAt,
        asOf: periodStartsAt,
      }),
    ).toBe(6_000);
  });

  it('rounds a partial remaining period up to one minor unit', () => {
    expect(
      proratedTariffUpgradeAmountMinor({
        currentPriceMinor: 100,
        targetPriceMinor: 101,
        periodStartsAt,
        periodEndsAt,
        asOf: '2026-08-06T00:00:00.000Z',
      }),
    ).toBe(1);
  });

  it('returns zero, never a negative charge, at and after the paid boundary', () => {
    for (const asOf of [periodEndsAt, '2026-08-12T00:00:00.000Z']) {
      expect(
        proratedTariffUpgradeAmountMinor({
          currentPriceMinor: 10_000,
          targetPriceMinor: 16_000,
          periodStartsAt,
          periodEndsAt,
          asOf,
        }),
      ).toBe(0);
    }
  });
});
