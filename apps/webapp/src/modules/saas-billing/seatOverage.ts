import { proratedRemainingPeriodAmountMinor } from './proration';

/**
 * ЕДИНСТВЕННОЕ место, где решается «можно ли сейчас продать дополнительное место, почём, на какой
 * отрезок услуги и до какого момента живёт счёт».
 *
 * Владелец 19.08 про прежнее состояние: «Как можно решать что-то в двух местах?». Решали двое:
 * `saas-billing/service.ts` отказывал, когда оплаченного периода нет вовсе, а расчёт цены в
 * `infra/repos/transactionQuotaPort.ts` на КОНЧИВШЕМСЯ периоде отвечал иначе — выставлял полный
 * месячный тариф за ноль оставшихся дней и срок услуги, который кончался раньше, чем начинался.
 * Две реализации одного правила разъехались ровно там, где ни одна не была домом.
 *
 * Поэтому здесь — весь ответ целиком и сразу. Обход невозможен не по договорённости, а по
 * построению (AGENTS.md §5 «Один общий проход, и мимо него нельзя»): `proratedSeatPriceMinor` из
 * этого файла НЕ экспортируется, а порт репозитория принимает готовое предложение и не имеет
 * параметров, которыми можно было бы подсунуть свою цену, своё окно или свой срок. Второй ответ
 * физически нечем собрать — он не компилируется.
 *
 * Решение владельца Р-15 в ДЕЙСТВУЮЩЕЙ редакции (19.08, после принятия мировой практики; срок счёта
 * поверх неё уточнён 20.08 решением Р-19), реестр `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`
 * §5а-0:
 *
 *   «Место открывается СРАЗУ, пропорциональная доплата уходит в следующий счёт… Пропорция
 *   считается ОТ МОМЕНТА добавления места до конца оплаченного периода, не от начала суток…
 *   [Р-19] Срок у счёта ОДИН — конец периода; дальше Р-18. Отдельным счётом место оплачивается
 *   ОДИН РАЗ, на момент открытия нового места — до конца периода клиника оплатила, получила.»
 *
 * Р-19 («короче перевыставление — бред, убирать») отменил ДЛИТЕЛЬНОСТЬ-ОТ-ВЫСТАВЛЕНИЯ и
 * перевыставление просроченного счёта целиком: «У него срок до конца период, потом он протух и
 * долг включился в стоимость следующего периода (и там по счету либо автосписание, либо при
 * неуспехе — счет ждет ручную оплату)». Место здесь поэтому всегда открывается заново, в момент
 * решения (`asOf`) — сохранённого момента открытия для перевыставления приносить больше некому.
 * Освободили место — счёта за него больше нет вовсе (его отменяют, Р-17 не про этот счёт).
 *
 * Прежняя редакция («до конца суток», «только после оплаты», отсчёт от местной полуночи) ОТМЕНЕНА
 * 19.08; обоснование — `SEAT_INVOICE_WORLD_PRACTICE_2026-08-19.md`, владелец: «окей, я принимаю,
 * всё». Вместе с ней ушёл и часовой пояс: суток в этом расчёте больше нет, все моменты абсолютные
 * (Р-16 «к счёту за место больше не относится» — реестр §5а-0).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Цена места до конца уже оплаченного периода. Приватна намеренно: цена места существует только
 * внутри предложения ниже, вместе с окном услуги и сроком счёта, — по отдельности они и разъехались.
 *
 * Гранулярность — СУТКИ, но сетка суток привязана к КОНЦУ оплаченного периода, а не к полуночи.
 * Так делает Stripe («Les limites du jour correspondent à l'heure de début de la période de
 * facturation de l'abonnement, et non à minuit… Les limites sont indépendantes du fuseau horaire»),
 * и именно это одновременно закрывает два требования, которые на полуночной сетке несовместимы:
 *
 * — цена ДОЛЖНА быть неподвижной какое-то время: то же число показывается клинике на экране и
 *   сверяется подписанной котировкой при подтверждении, а миллисекундная цена протухает в момент
 *   отрисовки и подтвердить её нельзя никогда;
 * — платить клиника ДОЛЖНА только за оставшееся: остаток считается от МОМЕНТА добавления места
 *   (Р-15), поэтому прошедшие сегодня часы в счёт не попадают вовсе.
 *
 * Округление — остатка ВВЕРХ до целых суток, отсчитываемых назад от конца периода. Из-за него в
 * формулу подставляется момент РАНЬШЕ начала периода, когда покупка идёт в первый день, — и тогда
 * единственное, что не даёт счёту за место превысить полную цену места, это потолок
 * `Math.min(endsAt - startsAt, endsAt - asOf)` в `proration.ts`. Он там несущий, не декоративный.
 */
function proratedSeatPriceMinor(input: {
  seatPriceMinor: number;
  periodStartsAt: string;
  periodEndsAt: string;
  chargedFromMs: number;
}): number {
  return proratedRemainingPeriodAmountMinor({
    currentPriceMinor: 0,
    targetPriceMinor: input.seatPriceMinor,
    periodStartsAt: input.periodStartsAt,
    periodEndsAt: input.periodEndsAt,
    asOf: new Date(input.chargedFromMs).toISOString(),
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
  /**
   * Момент, до которого `priceMinor` неподвижна, — верхняя граница срока котировки. Это НЕ срок
   * счёта: у выставленного счёта цена уже зафиксирована отрезком услуги и больше не меняется.
   */
  priceStableUntil: string;
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
  if (endsAtMs <= asOfMs) return { outcome: 'paid_period_over' };

  // Отрезок услуги начинается в момент решения — место открывается СРАЗУ (Р-15), а перевыставления,
  // которое приносило бы сюда сохранённый более ранний момент открытия, больше нет (Р-19). Место,
  // открытое до текущего периода, этому счёту не встречается: счёт за него уже существует и второй
  // раз тем же событием не выставляется.
  const servicePeriodStartsAtMs = Math.max(startsAtMs, asOfMs);
  // Целые сутки остатка, отсчитанные назад от конца периода. Между двумя соседними границами цена
  // не меняется — это и есть окно, внутри которого котировку можно подтвердить.
  const chargedDays = Math.ceil((endsAtMs - servicePeriodStartsAtMs) / DAY_MS);

  return {
    outcome: 'purchasable',
    priceMinor: proratedSeatPriceMinor({
      seatPriceMinor: input.additionalSeatPriceMinor,
      periodStartsAt: input.currentPeriodStartsAt,
      periodEndsAt: input.currentPeriodEndsAt,
      chargedFromMs: endsAtMs - chargedDays * DAY_MS,
    }),
    currency: input.currency,
    // Место открывается СРАЗУ (Р-15), поэтому услуга начинается в момент решения, а не в момент
    // прихода денег: платёж больше не является условием доступа.
    servicePeriodStartsAt: new Date(servicePeriodStartsAtMs).toISOString(),
    servicePeriodEndsAt: input.currentPeriodEndsAt,
    priceStableUntil: new Date(endsAtMs - (chargedDays - 1) * DAY_MS).toISOString(),
  };
}
