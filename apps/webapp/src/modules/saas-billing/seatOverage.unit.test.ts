import { describe, expect, it } from 'vitest';
import { decideSeatOverage } from './seatOverage';

/**
 * Проверки цены и доступности места, переехавшие сюда вместе с самим решением: раньше они стояли
 * над `proratedSeatPriceMinor` (`proration.test.ts`) и над `decideClinicTeamQuota`
 * (`transactionQuotaPort.unit.test.ts`) — двумя половинами одного ответа. Утверждение про нулевой
 * остаток («место всё равно стоит полный тариф») приведено в соответствие с решением владельца
 * Р-15: продавать в кончившийся период нечего, счёта нет.
 */
describe('decideSeatOverage', () => {
  // 30 суток по календарю клиники: 01.08 00:00 → 31.08 00:00 МСК, то есть UTC−3. Пояс задан
  // явно — от пояса машины и от суток UTC здесь не зависит ничего.
  const PAID_PERIOD = {
    currentPeriodStartsAt: '2026-07-31T21:00:00.000Z',
    currentPeriodEndsAt: '2026-08-30T21:00:00.000Z',
  };
  const AT_LIMIT = {
    includedSeats: 1,
    paidAdditionalSeats: 0,
    used: 1,
    additionalSeatPriceMinor: 150_000,
    currency: 'RUB',
    timeZone: 'Europe/Moscow',
    ...PAID_PERIOD,
  };

  it('lets the invite through until usage reaches the included plus paid allowance', () => {
    expect(
      decideSeatOverage({ ...AT_LIMIT, paidAdditionalSeats: 1, asOf: '2026-08-16T09:41:00.000Z' })
        .outcome,
    ).toBe('seat_available');
  });

  /**
   * Пробивается: середина 30-дневного периода снова стоит полные 150 000. Половина остатка —
   * половина цены, и это ЕДИНСТВЕННОЕ число: его же видит человек и его же несёт счёт.
   */
  it('quotes a mid-period seat at the days left in the already-paid period', () => {
    expect(decideSeatOverage({ ...AT_LIMIT, asOf: '2026-08-16T09:41:00.000Z' })).toEqual({
      outcome: 'purchasable',
      priceMinor: 75_000,
      currency: 'RUB',
      servicePeriodStartsAt: '2026-08-16T09:41:00.000Z',
      servicePeriodEndsAt: '2026-08-30T21:00:00.000Z',
      // Р-15: счёт живёт до конца суток КЛИНИКИ. Москва = UTC+3, значит 21:00 UTC.
      invoiceExpiresAt: '2026-08-16T21:00:00.000Z',
    });
  });

  /**
   * Клиника подтверждает ту цену, которую ей показали. Цена, меняющаяся между отрисовкой и кликом,
   * возвращается `price_changed` каждый раз и покупка не завершается никогда — поэтому цена
   * считается в сутках и стоит неподвижно все местные сутки.
   */
  it('holds one price for the whole clinic day, so a confirmation cannot race the clock', () => {
    // Московские сутки 16.08 — это 15.08 21:00 UTC → 16.08 21:00 UTC.
    const first = decideSeatOverage({ ...AT_LIMIT, asOf: '2026-08-15T21:00:00.000Z' });
    const last = decideSeatOverage({ ...AT_LIMIT, asOf: '2026-08-16T20:59:59.999Z' });
    const nextDay = decideSeatOverage({ ...AT_LIMIT, asOf: '2026-08-16T21:00:00.000Z' });
    expect(first.outcome === 'purchasable' && first.priceMinor).toBe(
      last.outcome === 'purchasable' && last.priceMinor,
    );
    expect(nextDay.outcome === 'purchasable' && nextDay.priceMinor).not.toBe(
      last.outcome === 'purchasable' && last.priceMinor,
    );
  });

  /**
   * Р-15 дословно: «Отдельным счётом это оплачивается только один раз, на момент открытия нового
   * места — до конца периода клиника оплатила, получила». Кончившийся период — не остаток нулевой
   * длины, а отсутствие предмета продажи. Пробивается: возвращается полный месячный тариф места за
   * ноль оставшихся дней, со сроком услуги, который кончается раньше, чем начинается.
   */
  it('sells nothing once the paid period is over or absent', () => {
    for (const asOf of ['2026-08-30T21:00:00.000Z', '2026-09-02T00:00:00.000Z']) {
      expect(decideSeatOverage({ ...AT_LIMIT, asOf })).toEqual({ outcome: 'paid_period_over' });
    }
    for (const window of [
      { currentPeriodStartsAt: null, currentPeriodEndsAt: PAID_PERIOD.currentPeriodEndsAt },
      { currentPeriodStartsAt: PAID_PERIOD.currentPeriodStartsAt, currentPeriodEndsAt: null },
      {
        currentPeriodStartsAt: PAID_PERIOD.currentPeriodEndsAt,
        currentPeriodEndsAt: PAID_PERIOD.currentPeriodStartsAt,
      },
    ]) {
      expect(
        decideSeatOverage({ ...AT_LIMIT, ...window, asOf: '2026-08-16T09:41:00.000Z' }),
      ).toEqual({ outcome: 'paid_period_over' });
    }
  });

  it('refuses seat growth when the tariff states no baseline and no seat price', () => {
    expect(
      decideSeatOverage({ ...AT_LIMIT, includedSeats: null, asOf: '2026-08-16T09:41:00.000Z' }),
    ).toEqual({ outcome: 'seat_not_sold' });
    expect(
      decideSeatOverage({
        ...AT_LIMIT,
        additionalSeatPriceMinor: null,
        asOf: '2026-08-16T09:41:00.000Z',
      }),
    ).toEqual({ outcome: 'seat_not_sold' });
  });
});
