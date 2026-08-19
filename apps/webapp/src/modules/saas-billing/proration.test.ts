import { describe, expect, it } from 'vitest';
import {
  billableAdditionalSeats,
  proratedRemainingPeriodAmountMinor,
  proratedSeatPriceMinor,
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
 * Решение владельца 18.08: «Если клиника ПОСРЕДИ ПЕРИОДА добавляет сотрудника — она оплачивает счёт
 * (с расчётом сколько сотрудников и сколько дней надо оплатить до конца оплаченного периода)».
 * Пробивается: место посреди периода снова стоит полный тариф места.
 */
describe('proratedSeatPriceMinor', () => {
  // 30 дней: 01.08 00:00 → 31.08 00:00.
  const periodStartsAt = '2026-08-01T00:00:00.000Z';
  const periodEndsAt = '2026-08-31T00:00:00.000Z';
  const seatPriceMinor = 150_000;

  it('costs exactly half at the midpoint of a 30-day period', () => {
    expect(
      proratedSeatPriceMinor({
        seatPriceMinor,
        periodStartsAt,
        periodEndsAt,
        asOf: '2026-08-16T09:41:00.000Z',
      }),
    ).toBe(75_000);
  });

  it('costs the full seat price on the first day and one day on the last', () => {
    expect(
      proratedSeatPriceMinor({
        seatPriceMinor,
        periodStartsAt,
        periodEndsAt,
        asOf: '2026-08-01T10:00:00.000Z',
      }),
    ).toBe(150_000);
    expect(
      proratedSeatPriceMinor({
        seatPriceMinor,
        periodStartsAt,
        periodEndsAt,
        asOf: '2026-08-30T18:00:00.000Z',
      }),
    ).toBe(5_000);
  });

  /**
   * The клиника confirms the price it was shown. A quote that moves between the render and the
   * click comes back `price_changed` every time and the purchase can never complete — so the
   * price is counted in days and holds still for the whole day.
   */
  it('holds one price for the whole day, so a confirmation cannot race the clock', () => {
    const atStartOfDay = proratedSeatPriceMinor({
      seatPriceMinor,
      periodStartsAt,
      periodEndsAt,
      asOf: '2026-08-16T00:00:00.000Z',
    });
    const atEndOfDay = proratedSeatPriceMinor({
      seatPriceMinor,
      periodStartsAt,
      periodEndsAt,
      asOf: '2026-08-16T23:59:59.999Z',
    });
    expect(atEndOfDay).toBe(atStartOfDay);
  });

  it('never hands out a free seat when there is no remaining paid window', () => {
    for (const window of [
      { periodStartsAt: null, periodEndsAt },
      { periodStartsAt, periodEndsAt: null },
      { periodStartsAt: periodEndsAt, periodEndsAt: periodStartsAt },
    ]) {
      expect(
        proratedSeatPriceMinor({ seatPriceMinor, ...window, asOf: '2026-08-16T00:00:00.000Z' }),
      ).toBe(150_000);
    }
    expect(
      proratedSeatPriceMinor({
        seatPriceMinor,
        periodStartsAt,
        periodEndsAt,
        asOf: '2026-09-02T00:00:00.000Z',
      }),
    ).toBe(150_000);
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
        carriedDebtMinor: 0,
      }),
    ).toBe(800_000);
  });

  it('costs less next period once a seat is no longer occupied', () => {
    expect(
      saasBillingPeriodAmountMinor({
        tariffPriceMinor: 500_000,
        additionalSeatPriceMinor: 150_000,
        additionalSeatQuantity: 1,
        carriedDebtMinor: 0,
      }),
    ).toBe(650_000);
  });

  it('refuses a period that bills seats the tariff cannot price', () => {
    expect(() =>
      saasBillingPeriodAmountMinor({
        tariffPriceMinor: 500_000,
        additionalSeatPriceMinor: null,
        additionalSeatQuantity: 1,
        carriedDebtMinor: 0,
      }),
    ).toThrow('saas_billing_additional_seat_price_missing');
  });
});
