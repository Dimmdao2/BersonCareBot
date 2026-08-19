import { proratedRemainingPeriodAmountMinor } from './proration';

/**
 * ЕДИНСТВЕННОЕ место, где решается «можно ли сейчас продать дополнительное место и почём».
 *
 * Владелец 19.08 про прежнее состояние: «Как можно решать что-то в двух местах?». Решали двое:
 * `saas-billing/service.ts` отказывал, когда оплаченного периода нет вовсе, а расчёт цены в
 * `infra/repos/transactionQuotaPort.ts` на КОНЧИВШЕМСЯ периоде отвечал иначе — выставлял полный
 * месячный тариф за ноль оставшихся дней и срок услуги, который кончался раньше, чем начинался.
 * Две реализации одного правила разъехались ровно там, где ни одна не была домом.
 *
 * Поэтому здесь — весь ответ целиком и сразу: продавать или нет, по какой цене, на какой отрезок
 * услуги и до какого момента живёт счёт. Обход невозможен не по договорённости, а по построению
 * (AGENTS.md §5 «Один общий проход, и мимо него нельзя»): `proratedSeatPriceMinor` и границы суток
 * из этого файла НЕ экспортируются, а порт репозитория принимает готовое предложение и не имеет
 * параметров, которыми можно было бы подсунуть свою цену, своё окно или свой срок. Второй ответ
 * физически нечем собрать — он не компилируется.
 *
 * Решение владельца Р-15 (19.08), реестр `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`
 * §5а-0: «Счёт на добавление нового сотрудника действует до конца суток. Новый сотрудник разрешается
 * только после оплаты счёта. Не оплатили до конца суток? Значит счёт не актуален, надо перевыставить
 * заново. Таким образом каждый день будет меняться сумма оставшегося времени до конца периода.
 * Отдельным счётом это оплачивается только один раз, на момент открытия нового места — до конца
 * периода клиника оплатила, получила. Со следующего периода стоимость включена в один счёт».
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Смещение зоны в конкретный момент. Считается разбором того же момента в целевой зоне: другого
 * способа получить IANA-смещение без библиотеки нет, а библиотеки в вебаппе для этого нет.
 */
function zoneOffsetMs(atMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(atMs));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  // `hour` в hour12:false отдаёт «24» за местную полночь в части сборок ICU — день при этом уже
  // правильный, поэтому час берётся по модулю, а не переносится на следующие сутки.
  const local = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour') % 24,
    read('minute'),
    read('second'),
  );
  return local - Math.floor(atMs / 1000) * 1000;
}

/** Начало местных суток клиники, в которых лежит `atMs`. */
function startOfClinicDayMs(atMs: number, timeZone: string): number {
  const offset = zoneOffsetMs(atMs, timeZone);
  const localMidnight = Math.floor((atMs + offset) / DAY_MS) * DAY_MS;
  const candidate = localMidnight - offset;
  // На переводе часов смещение в полночь и смещение в `atMs` разные — пересчитываем по кандидату.
  const midnightOffset = zoneOffsetMs(candidate, timeZone);
  return midnightOffset === offset ? candidate : localMidnight - midnightOffset;
}

/**
 * Конец местных суток клиники — момент, в который счёт на место перестаёт быть актуальным (Р-15).
 * Не «плюс 24 часа»: в сутки перевода часов их 23 или 25, и обе границы обязаны быть полуночью.
 * Зонд в +26 часов гарантированно попадает в следующие сутки при любой длине текущих.
 */
function clinicDayEndsAtMs(atMs: number, timeZone: string): number {
  return startOfClinicDayMs(startOfClinicDayMs(atMs, timeZone) + 26 * 60 * 60 * 1000, timeZone);
}

/**
 * Цена места до конца уже оплаченного периода. Приватна намеренно: цена места существует только
 * внутри предложения ниже, вместе с окном услуги и сроком счёта, — по отдельности они и разъехались.
 *
 * Считается в СУТКАХ, а не в миллисекундах: то же число показывается клинике на экране и сверяется
 * при подтверждении, а миллисекундная цена протухает в момент отрисовки и подтвердить её нельзя
 * никогда. Р-15 говорит ровно это: «каждый день будет меняться сумма оставшегося времени».
 */
function proratedSeatPriceMinor(input: {
  seatPriceMinor: number;
  periodStartsAt: string;
  periodEndsAt: string;
  dayStartsAtMs: number;
}): number {
  return proratedRemainingPeriodAmountMinor({
    currentPriceMinor: 0,
    targetPriceMinor: input.seatPriceMinor,
    periodStartsAt: input.periodStartsAt,
    periodEndsAt: input.periodEndsAt,
    asOf: new Date(input.dayStartsAtMs).toISOString(),
  });
}

export type SeatOverageOffer =
  /** Место есть в уже оплаченном объёме — продавать нечего, приглашение просто проходит. */
  | { outcome: 'seat_available' }
  /** Тариф не продаёт места сверх включённых: не задан базис мест либо нет цены/валюты места. */
  | { outcome: 'seat_not_sold' }
  /**
   * Оплаченного периода нет или он уже кончился. По Р-15 отдельный счёт покрывает остаток ТЕКУЩЕГО
   * оплаченного периода — остатка нет, продавать не во что. Прежний ответ «полный тариф места за
   * ноль дней» был не строгостью, а ошибкой: клиника платила месяц за услугу нулевой длины.
   */
  | { outcome: 'paid_period_over' }
  | SeatOveragePurchasableOffer;

export type SeatOveragePurchasableOffer = {
  outcome: 'purchasable';
  priceMinor: number;
  currency: string;
  /** Место продаётся ВНУТРЬ уже оплаченного периода и кончается вместе с ним. */
  servicePeriodStartsAt: string;
  servicePeriodEndsAt: string;
  /** Р-15: счёт живёт до конца суток клиники, а не `invoiceValidityDays`, как остальные счета. */
  invoiceExpiresAt: string;
};

export function decideSeatOverage(input: {
  includedSeats: number | null;
  paidAdditionalSeats: number;
  used: number;
  additionalSeatPriceMinor: number | null;
  currency: string | null;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
  asOf: string;
  /** IANA клиники: сутки Р-15 — местные, а не UTC. Источник — `app_display_timezone`. */
  timeZone: string;
}): SeatOverageOffer {
  if (input.includedSeats === null) return { outcome: 'seat_not_sold' };
  if (input.used < input.includedSeats + input.paidAdditionalSeats) {
    return { outcome: 'seat_available' };
  }
  if (input.additionalSeatPriceMinor === null || input.currency === null) {
    return { outcome: 'seat_not_sold' };
  }

  const asOfMs = Date.parse(input.asOf);
  if (!Number.isFinite(asOfMs)) return { outcome: 'paid_period_over' };
  if (!input.currentPeriodStartsAt || !input.currentPeriodEndsAt) {
    return { outcome: 'paid_period_over' };
  }
  const startsAtMs = Date.parse(input.currentPeriodStartsAt);
  const endsAtMs = Date.parse(input.currentPeriodEndsAt);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) {
    return { outcome: 'paid_period_over' };
  }
  // Строго `asOf`, а не начало суток: период, кончившийся сегодня утром, кончился. Ослабление до
  // суток вернуло бы счёт, чей отрезок услуги завершается раньше, чем начинается.
  if (endsAtMs <= asOfMs) return { outcome: 'paid_period_over' };

  return {
    outcome: 'purchasable',
    priceMinor: proratedSeatPriceMinor({
      seatPriceMinor: input.additionalSeatPriceMinor,
      periodStartsAt: input.currentPeriodStartsAt,
      periodEndsAt: input.currentPeriodEndsAt,
      dayStartsAtMs: startOfClinicDayMs(asOfMs, input.timeZone),
    }),
    currency: input.currency,
    servicePeriodStartsAt: new Date(asOfMs).toISOString(),
    servicePeriodEndsAt: input.currentPeriodEndsAt,
    invoiceExpiresAt: new Date(clinicDayEndsAtMs(asOfMs, input.timeZone)).toISOString(),
  };
}
