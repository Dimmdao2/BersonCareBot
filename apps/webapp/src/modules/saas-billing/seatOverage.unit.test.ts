import { describe, expect, it } from 'vitest';
import { decideSeatOverage } from './seatOverage';

/**
 * Проверки цены и доступности места у единственной двери.
 *
 * ⚠️ Смена authority, а не подгонка под код: прежняя редакция этого файла закрепляла ОТМЕНЁННУЮ
 * редакцию Р-15 — отсчёт от местной полуночи, срок счёта «до конца суток клиники», часовой пояс на
 * денежном пути. Владелец 19.08 заменил её на действующую («окей, я принимаю, всё», обоснование —
 * `SEAT_INVOICE_WORLD_PRACTICE_2026-08-19.md`), поэтому ожидания переписаны под неё: остаток
 * считается от МОМЕНТА добавления, суток и поясов в расчёте нет вовсе. Владелец 20.08 (Р-19) поверх
 * этого отменил и «срок счёта — длительность от выставления» вместе с перевыставлением: у счёта за
 * место остался один срок, конец периода (`servicePeriodEndsAt`), поэтому дверь больше не выдаёт
 * `invoiceExpiresAt`/не принимает `invoiceValidityDays`/`seatOpenedAt` вовсе.
 */
describe('decideSeatOverage', () => {
  // Ровно 30 суток, чтобы доли остатка читались глазами.
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
    ...PAID_PERIOD,
  };

  it('lets the invite through until usage reaches the included plus paid allowance', () => {
    expect(
      decideSeatOverage({ ...AT_LIMIT, paidAdditionalSeats: 1, asOf: '2026-08-16T09:41:00.000Z' })
        .outcome,
    ).toBe('seat_available');
  });

  /**
   * Р-15: «Пропорция считается ОТ МОМЕНТА добавления места до конца оплаченного периода, не от
   * начала суток». Остаток здесь — 14 суток 11 часов 19 минут, округляется вверх до 15 целых суток
   * из 30, то есть ровно половина цены места. Прошедшие сегодня часы в счёт не попадают: прежняя
   * редакция считала от местной полуночи и брала за них деньги.
   */
  it('quotes a mid-period seat at the whole days left from the moment of the purchase', () => {
    expect(decideSeatOverage({ ...AT_LIMIT, asOf: '2026-08-16T09:41:00.000Z' })).toEqual({
      outcome: 'purchasable',
      priceMinor: 75_000,
      currency: 'RUB',
      // Место открывается СРАЗУ — услуга начинается в момент решения, а не в момент оплаты.
      servicePeriodStartsAt: '2026-08-16T09:41:00.000Z',
      servicePeriodEndsAt: '2026-08-30T21:00:00.000Z',
      // Следующая граница целых суток остатка, отсчитанных от конца периода.
      priceStableUntil: '2026-08-16T21:00:00.000Z',
    });
  });

  /**
   * Клиника подтверждает ту цену, которую ей показали. Цена, меняющаяся между отрисовкой и кликом,
   * возвращается `price_changed` каждый раз и покупка не завершается никогда — поэтому цена
   * неподвижна между двумя границами целых суток остатка, и котировка живёт не дольше границы.
   */
  it('holds one price up to the next whole-day boundary, so a confirmation cannot race the clock', () => {
    const first = decideSeatOverage({ ...AT_LIMIT, asOf: '2026-08-15T21:00:00.000Z' });
    const last = decideSeatOverage({ ...AT_LIMIT, asOf: '2026-08-16T20:59:59.999Z' });
    const afterBoundary = decideSeatOverage({ ...AT_LIMIT, asOf: '2026-08-16T21:00:00.000Z' });
    expect(first.outcome === 'purchasable' && first.priceMinor).toBe(
      last.outcome === 'purchasable' && last.priceMinor,
    );
    expect(first.outcome === 'purchasable' && first.priceStableUntil).toBe(
      last.outcome === 'purchasable' && last.priceStableUntil,
    );
    expect(afterBoundary.outcome === 'purchasable' && afterBoundary.priceMinor).not.toBe(
      last.outcome === 'purchasable' && last.priceMinor,
    );
  });

  /**
   * Р-15: «Отдельным счётом место оплачивается один раз, на момент открытия; со следующего периода
   * стоимость входит в общий счёт». Кончившийся период — не остаток нулевой длины, а отсутствие
   * предмета продажи. Пробивается: возвращается полный месячный тариф места за ноль оставшихся
   * дней, со сроком услуги, который кончается раньше, чем начинается.
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
