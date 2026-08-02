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

  it('requires paid-seat confirmation until capture increases the shared allowance', () => {
    const atBaseLimit = {
      includedSeats: 1,
      paidAdditionalSeats: 0,
      used: 1,
      additionalSeatPriceMinor: 1_500,
      currency: 'RUB',
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
      }),
    ).toEqual({ allowed: false, code: 'seat_limit_reached' });
  });
});
