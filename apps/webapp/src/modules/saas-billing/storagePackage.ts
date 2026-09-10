import { proratedRemainingPeriodAmountMinor } from './proration';

/**
 * ЕДИНСТВЕННОЕ место, где решается «можно ли сейчас продать объём (или сменить пакет), почём, на
 * какой отрезок услуги и до какого момента живёт счёт», — и оно же отвечает, можно ли от пакета
 * отказаться.
 *
 * Построено по образцу двери продажи места (`seatOverage.ts`) и по прямому указанию владельца
 * 10.09.2026: «модель расчёта у нас уже была прописана… стоимость рассчитывается с момента покупки
 * до конца периода подписки основного тарифа. Доплачивается вот эта вот рассчитанная сумма.
 * Предоставляется пакет места [сразу], со следующего периода счёт выставляется». То есть Р-15/Р-18/
 * Р-19 применяются к объёму ровно так же, как к местам, и новой денежной формулы здесь нет —
 * `proratedRemainingPeriodAmountMinor` уже умеет случай «переход с одной цены на другую внутри
 * периода», а переход с нуля есть частный случай того же перехода.
 *
 * Как и у мест, цена наружу отдельно не экспортируется: цена существует только внутри предложения,
 * вместе с отрезком услуги и сроком счёта — по отдельности они и разъезжаются (провал 19.08,
 * владелец: «Как можно решать что-то в двух местах?»).
 *
 * Отказ от пакета — тоже решение этой двери, а не отдельного экрана. Владелец 10.09, дословно:
 * «пока он места не освободит, этого не может произойти — отказ на отключение доппакета». Причина
 * не в жадности: занятые байты продолжают лежать у нас и раздаваться, поэтому услуга продолжается,
 * а значит продолжается и счёт. Освободил место — пакет снимается с конца оплаченного периода
 * (оплаченное назад не отбираем, Р-18).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type StoragePackagePurchaseOffer =
  /** Этот же пакет уже действует — продавать нечего. */
  | { outcome: 'already_active' }
  /**
   * Платформа не продаёт этот объём: пакет снят с продажи, у него нет цены за период подписки
   * организации, или валюта пакета не совпадает с валютой тарифа (в одном счёте двух валют нет).
   */
  | { outcome: 'not_sold' }
  /**
   * Оплаченного периода нет или он кончился. Пропорция считается ВНУТРЬ оплаченного периода —
   * остатка нет, продавать не во что; объём придёт вместе с оплатой следующего периода.
   */
  | { outcome: 'paid_period_over' }
  /**
   * Переход на пакет МЕНЬШЕГО объёма деньгами внутри периода не решается: уже оплаченное назад не
   * отбирается (Р-18), и он вступает с начала следующего периода. Это не отказ — это другой
   * маршрут, `decideStoragePackageRelease`.
   */
  | { outcome: 'downgrade_at_period_end' }
  | StoragePackagePurchasableOffer;

export type StoragePackagePurchasableOffer = {
  outcome: 'purchasable';
  amountMinor: number;
  currency: string;
  /** Объём открывается СРАЗУ, поэтому услуга начинается в момент решения. */
  servicePeriodStartsAt: string;
  servicePeriodEndsAt: string;
  /** Р-19: срок у счёта один — конец периода; дальше долг переносится (Р-18). */
  expiresAt: string;
  /** Момент, до которого `amountMinor` неподвижна, — верхняя граница срока котировки. */
  priceStableUntil: string;
};

/**
 * Цена пакета за период подписки. Пакет с ценой за месяц, купленный к годовому тарифу, стоит
 * годовую цену: докупка живёт внутри периода основного тарифа и кончается вместе с ним.
 */
export type StoragePackagePeriodPricing = {
  packageId: string;
  bytes: number;
  priceMinor: number | null;
  currency: string | null;
  isActive: boolean;
};

export function decideStoragePackagePurchase(input: {
  current: StoragePackagePeriodPricing | null;
  target: StoragePackagePeriodPricing;
  tariffCurrency: string | null;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
  asOf: string;
}): StoragePackagePurchaseOffer {
  if (input.current?.packageId === input.target.packageId) return { outcome: 'already_active' };
  if (!input.target.isActive) return { outcome: 'not_sold' };
  if (input.target.priceMinor === null || input.target.currency === null) {
    return { outcome: 'not_sold' };
  }
  // Валюта счёта одна. Пакет в другой валюте, чем тариф, нельзя ни сложить с ним в счёте продления,
  // ни выставить отдельно, не заведя вторую валюту в биллинге организации.
  if (input.tariffCurrency !== null && input.target.currency !== input.tariffCurrency) {
    return { outcome: 'not_sold' };
  }
  if (input.current && input.target.bytes <= input.current.bytes) {
    return { outcome: 'downgrade_at_period_end' };
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

  const servicePeriodStartsAtMs = Math.max(startsAtMs, asOfMs);
  // Та же сетка суток, что у места: целые сутки остатка, отсчитанные НАЗАД от конца периода. Между
  // двумя соседними границами цена неподвижна — это и есть окно, внутри которого выписанную
  // котировку можно подтвердить, не обещая вчерашнюю цену за более короткий остаток.
  const chargedDays = Math.ceil((endsAtMs - servicePeriodStartsAtMs) / DAY_MS);

  return {
    outcome: 'purchasable',
    // Доплачивается РАЗНИЦА: клиника уже оплатила текущий пакет до конца периода, второй раз за
    // те же дни она не платит. С нуля это та же формула с `currentPriceMinor = 0`.
    amountMinor: proratedRemainingPeriodAmountMinor({
      currentPriceMinor: input.current?.priceMinor ?? 0,
      targetPriceMinor: input.target.priceMinor,
      periodStartsAt: input.currentPeriodStartsAt,
      periodEndsAt: input.currentPeriodEndsAt,
      asOf: new Date(endsAtMs - chargedDays * DAY_MS).toISOString(),
    }),
    currency: input.target.currency,
    servicePeriodStartsAt: new Date(servicePeriodStartsAtMs).toISOString(),
    servicePeriodEndsAt: input.currentPeriodEndsAt,
    expiresAt: input.currentPeriodEndsAt,
    priceStableUntil: new Date(endsAtMs - (chargedDays - 1) * DAY_MS).toISOString(),
  };
}

export type StoragePackageReleaseDecision =
  /** Отказаться не от чего. */
  | { outcome: 'no_package' }
  /**
   * Владелец 10.09: «пока он места не освободит, этого не может произойти». `freeBytes` — сколько
   * ИМЕННО надо освободить, чтобы отказ прошёл; экран обязан назвать это число, а не просто
   * отказать.
   */
  | { outcome: 'occupied'; freeBytes: number; limitWithoutPackage: number }
  /** Отказ принят: пакет действует до конца оплаченного периода и дальше не продлевается (Р-18). */
  | { outcome: 'released_at_period_end'; effectiveAt: string | null };

export function decideStoragePackageRelease(input: {
  current: StoragePackagePeriodPricing | null;
  /** Потолок объёма БЕЗ пакета: тариф плюс исключение организации. `null` — без ограничения. */
  limitWithoutPackageBytes: number | null;
  usedBytes: number;
  currentPeriodEndsAt: string | null;
}): StoragePackageReleaseDecision {
  if (!input.current) return { outcome: 'no_package' };
  if (input.limitWithoutPackageBytes !== null && input.usedBytes > input.limitWithoutPackageBytes) {
    return {
      outcome: 'occupied',
      freeBytes: input.usedBytes - input.limitWithoutPackageBytes,
      limitWithoutPackage: input.limitWithoutPackageBytes,
    };
  }
  return { outcome: 'released_at_period_end', effectiveAt: input.currentPeriodEndsAt };
}

/**
 * КАКОЙ пакет действует со следующего периода — одно правило, одна реализация.
 *
 * Три колонки подписки описывают три различимых состояния (см. миграцию
 * `20260910T193000`), и вопрос «что продлевать» имеет ровно один ответ, который обязан совпадать у
 * счёта продления, у переноса при оплате и у экрана. Написанный трижды, он разошёлся бы молча и на
 * деньгах: счёт бы выставили за старый пакет, а подняли бы новый.
 *
 * Порядок важен: назначенный переход побеждает, отказ снимает пакет, иначе продолжается текущий.
 */
export function storagePackageForNextPeriod(subscription: {
  paidStoragePackageId: string | null;
  pendingStoragePackageId: string | null;
  storagePackageCancelAtPeriodEnd: boolean;
}): string | null {
  if (subscription.pendingStoragePackageId) return subscription.pendingStoragePackageId;
  if (subscription.storagePackageCancelAtPeriodEnd) return null;
  return subscription.paidStoragePackageId;
}
