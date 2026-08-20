import { describe, expect, it } from 'vitest';
import { decideStockQuota } from './transactionQuotaPort';

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
});
