import { describe, expect, it } from 'vitest';
import {
  decideStoragePackagePurchase,
  decideStoragePackageRelease,
  type StoragePackagePeriodPricing,
} from './storagePackage';

const GB = 1024 * 1024 * 1024;

const PERIOD = {
  currentPeriodStartsAt: '2026-09-01T00:00:00.000Z',
  currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
};

const pkg = (
  id: string,
  bytes: number,
  priceMinor: number | null,
  overrides: Partial<StoragePackagePeriodPricing> = {},
): StoragePackagePeriodPricing => ({
  packageId: id,
  bytes,
  priceMinor,
  currency: 'RUB',
  isActive: true,
  ...overrides,
});

describe('storage package purchase door', () => {
  it('charges only the remaining part of the paid period, from the moment of purchase', () => {
    const offer = decideStoragePackagePurchase({
      current: null,
      target: pkg('p50', 50 * GB, 30_000),
      tariffCurrency: 'RUB',
      ...PERIOD,
      // Ровно половина тридцатидневного периода позади.
      asOf: '2026-09-16T00:00:00.000Z',
    });

    expect(offer.outcome).toBe('purchasable');
    if (offer.outcome !== 'purchasable') return;
    // 15 суток остатка из 30 → половина цены.
    expect(offer.amountMinor).toBe(15_000);
    expect(offer.servicePeriodStartsAt).toBe('2026-09-16T00:00:00.000Z');
    // Услуга и срок счёта кончаются вместе с оплаченным периодом (Р-19).
    expect(offer.servicePeriodEndsAt).toBe(PERIOD.currentPeriodEndsAt);
    expect(offer.expiresAt).toBe(PERIOD.currentPeriodEndsAt);
  });

  it('bills only the difference when moving to a bigger package inside the same period', () => {
    const offer = decideStoragePackagePurchase({
      current: pkg('p50', 50 * GB, 30_000),
      target: pkg('p100', 100 * GB, 50_000),
      tariffCurrency: 'RUB',
      ...PERIOD,
      asOf: '2026-09-16T00:00:00.000Z',
    });

    expect(offer.outcome).toBe('purchasable');
    if (offer.outcome !== 'purchasable') return;
    // За те же 15 суток клиника уже заплатила по прежнему пакету — доплачивается разница.
    expect(offer.amountMinor).toBe(10_000);
  });

  it('refuses to sell what cannot be billed or delivered', () => {
    const target = pkg('p50', 50 * GB, 30_000);

    expect(
      decideStoragePackagePurchase({
        current: target,
        target,
        tariffCurrency: 'RUB',
        ...PERIOD,
        asOf: '2026-09-16T00:00:00.000Z',
      }).outcome,
    ).toBe('already_active');
    expect(
      decideStoragePackagePurchase({
        current: null,
        target: pkg('p50', 50 * GB, 30_000, { isActive: false }),
        tariffCurrency: 'RUB',
        ...PERIOD,
        asOf: '2026-09-16T00:00:00.000Z',
      }).outcome,
    ).toBe('not_sold');
    // Нет цены за период, которым платит организация.
    expect(
      decideStoragePackagePurchase({
        current: null,
        target: pkg('p50', 50 * GB, null),
        tariffCurrency: 'RUB',
        ...PERIOD,
        asOf: '2026-09-16T00:00:00.000Z',
      }).outcome,
    ).toBe('not_sold');
    // Чужая валюта: в одном счёте двух валют нет.
    expect(
      decideStoragePackagePurchase({
        current: null,
        target: pkg('p50', 50 * GB, 30_000, { currency: 'EUR' }),
        tariffCurrency: 'RUB',
        ...PERIOD,
        asOf: '2026-09-16T00:00:00.000Z',
      }).outcome,
    ).toBe('not_sold');
    // Оплаченного периода нет — пропорцию считать не внутри чего.
    expect(
      decideStoragePackagePurchase({
        current: null,
        target,
        tariffCurrency: 'RUB',
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
        asOf: '2026-09-16T00:00:00.000Z',
      }).outcome,
    ).toBe('paid_period_over');
    // Период кончился, пока клиника думала.
    expect(
      decideStoragePackagePurchase({
        current: null,
        target,
        tariffCurrency: 'RUB',
        ...PERIOD,
        asOf: '2026-10-02T00:00:00.000Z',
      }).outcome,
    ).toBe('paid_period_over');
  });

  it('never returns money for a smaller package mid-period', () => {
    expect(
      decideStoragePackagePurchase({
        current: pkg('p100', 100 * GB, 50_000),
        target: pkg('p50', 50 * GB, 30_000),
        tariffCurrency: 'RUB',
        ...PERIOD,
        asOf: '2026-09-16T00:00:00.000Z',
      }).outcome,
    ).toBe('downgrade_at_period_end');
  });
});

describe('storage package release door', () => {
  it('refuses the release while the volume is still occupied and names how much to free', () => {
    const decision = decideStoragePackageRelease({
      current: pkg('p50', 50 * GB, 30_000),
      limitWithoutPackageBytes: 25 * GB,
      usedBytes: 40 * GB,
      currentPeriodEndsAt: PERIOD.currentPeriodEndsAt,
    });

    expect(decision).toEqual({
      outcome: 'occupied',
      freeBytes: 15 * GB,
      limitWithoutPackage: 25 * GB,
    });
  });

  it('accepts the release once the volume fits without the package, from the period end', () => {
    expect(
      decideStoragePackageRelease({
        current: pkg('p50', 50 * GB, 30_000),
        limitWithoutPackageBytes: 25 * GB,
        usedBytes: 25 * GB,
        currentPeriodEndsAt: PERIOD.currentPeriodEndsAt,
      }),
    ).toEqual({ outcome: 'released_at_period_end', effectiveAt: PERIOD.currentPeriodEndsAt });
    // Тариф без ограничения объёма — освобождать нечего, отказ проходит всегда.
    expect(
      decideStoragePackageRelease({
        current: pkg('p50', 50 * GB, 30_000),
        limitWithoutPackageBytes: null,
        usedBytes: 900 * GB,
        currentPeriodEndsAt: null,
      }),
    ).toEqual({ outcome: 'released_at_period_end', effectiveAt: null });
  });

  it('has nothing to release when no package is active', () => {
    expect(
      decideStoragePackageRelease({
        current: null,
        limitWithoutPackageBytes: 25 * GB,
        usedBytes: 90 * GB,
        currentPeriodEndsAt: PERIOD.currentPeriodEndsAt,
      }).outcome,
    ).toBe('no_package');
  });
});
