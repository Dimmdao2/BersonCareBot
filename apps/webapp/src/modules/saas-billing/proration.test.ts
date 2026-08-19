import { describe, expect, it } from 'vitest';
import {
  billableAdditionalSeats,
  proratedRemainingPeriodAmountMinor,
  saasBillingPeriodAmountMinor,
} from './proration';

describe('proratedRemainingPeriodAmountMinor', () => {
  const periodStartsAt = '2026-08-01T00:00:00.000Z';
  const periodEndsAt = '2026-08-11T00:00:00.000Z';

  it('charges the full tariff difference at the first instant of a paid period', () => {
    expect(
      proratedRemainingPeriodAmountMinor({
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
      proratedRemainingPeriodAmountMinor({
        currentPriceMinor: 100,
        targetPriceMinor: 101,
        periodStartsAt,
        periodEndsAt,
        asOf: '2026-08-06T00:00:00.000Z',
      }),
    ).toBe(1);
  });

  /**
   * Потолок `Math.min(endsAt - startsAt, endsAt - asOf)`. Несущий, а не декоративный: дверь места
   * округляет остаток вверх до целых суток от КОНЦА периода (Р-15) и на периоде, длина которого не
   * кратна суткам, подставляет сюда момент РАНЬШЕ начала периода. Без потолка доплата за место
   * выходит дороже полной цены места — находка F4 слепого аудита 19.08.
   */
  it('never charges more than the whole period, even asked about a moment before it started', () => {
    expect(
      proratedRemainingPeriodAmountMinor({
        currentPriceMinor: 0,
        targetPriceMinor: 150_000,
        periodStartsAt: '2026-08-01T12:00:00.000Z',
        periodEndsAt: '2026-08-31T11:00:00.000Z',
        asOf: '2026-08-01T11:00:00.000Z',
      }),
    ).toBe(150_000);
  });

  it('returns zero, never a negative charge, at and after the paid boundary', () => {
    for (const asOf of [periodEndsAt, '2026-08-12T00:00:00.000Z']) {
      expect(
        proratedRemainingPeriodAmountMinor({
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

/**
 * Решение владельца 18.08: «Счётчик оплаченных мест только растёт — тоже косяк. Удалили/отключили
 * сотрудника — со следующего периода стоимость меньше». Пробивается: счётчик снова только растёт,
 * и клиника платит за уволенного сотрудника вечно.
 */
describe('billableAdditionalSeats', () => {
  it('drops a removed member from the seats the next period bills', () => {
    const paid = { includedSeats: 3, paidAdditionalSeats: 2 };
    expect(billableAdditionalSeats({ ...paid, activeSeatsUsed: 5 })).toBe(2);
    expect(billableAdditionalSeats({ ...paid, activeSeatsUsed: 4 })).toBe(1);
    expect(billableAdditionalSeats({ ...paid, activeSeatsUsed: 3 })).toBe(0);
    expect(billableAdditionalSeats({ ...paid, activeSeatsUsed: 1 })).toBe(0);
  });

  it('never bills more seats than the clinic actually paid for', () => {
    expect(
      billableAdditionalSeats({ includedSeats: 3, paidAdditionalSeats: 2, activeSeatsUsed: 9 }),
    ).toBe(2);
  });

  it('bills the paid seats when the tariff states no included-seat baseline', () => {
    expect(
      billableAdditionalSeats({ includedSeats: null, paidAdditionalSeats: 2, activeSeatsUsed: 0 }),
    ).toBe(2);
  });
});

/** Следующий период — ОДИН счёт: тариф плюс места по ПОЛНОЙ цене, никогда два счёта. */
describe('saasBillingPeriodAmountMinor', () => {
  it('bills one amount: tariff plus seats at full price', () => {
    expect(
      saasBillingPeriodAmountMinor({
        tariffPriceMinor: 500_000,
        additionalSeatPriceMinor: 150_000,
        additionalSeatQuantity: 2,
      }),
    ).toBe(800_000);
  });

  it('costs less next period once a seat is no longer occupied', () => {
    expect(
      saasBillingPeriodAmountMinor({
        tariffPriceMinor: 500_000,
        additionalSeatPriceMinor: 150_000,
        additionalSeatQuantity: 1,
      }),
    ).toBe(650_000);
  });

  it('refuses a period that bills seats the tariff cannot price', () => {
    expect(() =>
      saasBillingPeriodAmountMinor({
        tariffPriceMinor: 500_000,
        additionalSeatPriceMinor: null,
        additionalSeatQuantity: 1,
      }),
    ).toThrow('saas_billing_additional_seat_price_missing');
  });
});
