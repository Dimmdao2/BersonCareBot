import { describe, expect, it } from 'vitest';
import {
  decideClinicTeamQuota,
  decideStockQuota,
} from './transactionQuotaPort';

describe('transaction quota decisions', () => {
  it('applies the same numeric decision to a serialized next stock write', () => {
    const quota = { kind: 'numeric', limit: 1 };

    expect(decideStockQuota({ quota, used: 0, increment: 1 })).toBe('allowed');
    // The second writer evaluates after the first committed usage is visible under the same lock.
    expect(decideStockQuota({ quota, used: 1, increment: 1 })).toBe('reached');
  });

  /**
   * Owner 18.08 (L-1): «ЛИБО ЛИМИТ ЛИБО БЕЗ ЛИМИТА». A tariff that named no number for a
   * limit-bearing mechanic states «без лимита», so the write door lets growth through. Breakage
   * this pins: an absent number goes back to refusing the first location, patient and file on
   * СТАРТ/ПРОФИ/КЛИНИКА, whose `quotas` is `{}`.
   */
  it('allows stock growth when the tariff named no number for the mechanic', () => {
    expect(decideStockQuota({ quota: undefined, used: 0, increment: 1 })).toBe('allowed');
    expect(decideStockQuota({ quota: undefined, used: 40, increment: 1 })).toBe('allowed');
    expect(
      decideStockQuota({ quota: { kind: 'unlimited', limit: null }, used: 40, increment: 1 }),
    ).toBe('allowed');
  });

  /**
   * The enforcement half of the same rule: a number the owner DID set still bounds growth, and an
   * explicit zero permits nothing — that is how a tariff excludes a limit-bearing mechanic now.
   */
  it('still refuses growth past a number the tariff set, including zero', () => {
    expect(decideStockQuota({ quota: { kind: 'numeric', limit: 3 }, used: 2, increment: 1 })).toBe(
      'allowed',
    );
    expect(decideStockQuota({ quota: { kind: 'numeric', limit: 3 }, used: 3, increment: 1 })).toBe(
      'reached',
    );
    expect(decideStockQuota({ quota: { kind: 'numeric', limit: 0 }, used: 0, increment: 1 })).toBe(
      'reached',
    );
  });

  const PAID_PERIOD = {
    currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
    currentPeriodEndsAt: '2026-08-31T00:00:00.000Z',
  };

  it('requires paid-seat confirmation until capture increases the shared allowance', () => {
    const atBaseLimit = {
      includedSeats: 1,
      paidAdditionalSeats: 0,
      used: 1,
      additionalSeatPriceMinor: 1_500,
      currency: 'RUB',
      ...PAID_PERIOD,
      asOf: PAID_PERIOD.currentPeriodStartsAt,
    };

    expect(decideClinicTeamQuota(atBaseLimit)).toEqual({
      allowed: false,
      code: 'seat_overage_confirmation_required',
      priceMinor: 1_500,
      currency: 'RUB',
    });
    expect(
      decideClinicTeamQuota({ ...atBaseLimit, paidAdditionalSeats: 1 }),
    ).toEqual({ allowed: true });
  });

  it('refuses seat growth when the legacy tariff has no configured included-seat baseline', () => {
    expect(
      decideClinicTeamQuota({
        includedSeats: null,
        paidAdditionalSeats: 0,
        used: 0,
        additionalSeatPriceMinor: 1_500,
        currency: 'RUB',
        ...PAID_PERIOD,
        asOf: PAID_PERIOD.currentPeriodStartsAt,
      }),
    ).toEqual({ allowed: false, code: 'seat_limit_reached' });
  });

  /**
   * Решение владельца 18.08: место, купленное посреди периода, оплачивается «до конца оплаченного
   * периода», а не полным тарифом места. Это ЕДИНСТВЕННОЕ место, где место получает цену: и
   * подтверждение клинике, и сумма счёта берутся из этого решения, поэтому цена на экране и цена в
   * счёте не могут разойтись. Пробивается: середина 30-дневного периода снова стоит полные 150 000.
   */
  it('quotes a mid-period seat at the days left in the already-paid period', () => {
    expect(
      decideClinicTeamQuota({
        includedSeats: 1,
        paidAdditionalSeats: 0,
        used: 1,
        additionalSeatPriceMinor: 150_000,
        currency: 'RUB',
        ...PAID_PERIOD,
        asOf: '2026-08-16T09:41:00.000Z',
      }),
    ).toEqual({
      allowed: false,
      code: 'seat_overage_confirmation_required',
      priceMinor: 75_000,
      currency: 'RUB',
    });
  });
});
