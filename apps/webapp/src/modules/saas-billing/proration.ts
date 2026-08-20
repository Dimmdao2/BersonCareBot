/**
 * The proration amount is always rounded up to a whole minor unit.  This is deterministic and
 * means a positive upgrade never silently becomes free because its proportional remainder is a
 * fraction of one minor unit.
 */
export function proratedRemainingPeriodAmountMinor(input: {
  currentPriceMinor: number;
  targetPriceMinor: number;
  periodStartsAt: string;
  periodEndsAt: string;
  asOf: string;
}): number {
  if (
    !Number.isSafeInteger(input.currentPriceMinor) ||
    !Number.isSafeInteger(input.targetPriceMinor) ||
    input.currentPriceMinor < 0 ||
    input.targetPriceMinor < 0
  ) {
    throw new Error('saas_billing_tariff_price_invalid');
  }
  const startsAt = new Date(input.periodStartsAt).getTime();
  const endsAt = new Date(input.periodEndsAt).getTime();
  const asOf = new Date(input.asOf).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || !Number.isFinite(asOf) || endsAt <= startsAt) {
    throw new Error('saas_billing_paid_period_invalid');
  }

  const difference = Math.max(0, input.targetPriceMinor - input.currentPriceMinor);
  const totalMs = BigInt(endsAt - startsAt);
  const remainingMs = BigInt(Math.max(0, Math.min(endsAt - startsAt, endsAt - asOf)));
  const numerator = BigInt(difference) * remainingMs;
  const amount = (numerator + totalMs - 1n) / totalMs;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('saas_billing_proration_overflow');
  return Number(amount);
}

/**
 * Решение владельца 18.08: «Счётчик оплаченных мест только растёт — тоже косяк. Удалили/отключили
 * сотрудника — со следующего периода стоимость меньше».
 *
 * The next period bills the seats the clinic ACTUALLY occupies above the included allowance, never
 * more than it has paid for. Derived from live membership rather than decremented on removal: a
 * stored counter is only as correct as the last write path that remembered to decrement it, and a
 * counter that has drifted looks exactly like a correct one. No refund path — a seat already paid
 * for stands until the period ends, it is simply not billed again.
 */
export function billableAdditionalSeats(input: {
  includedSeats: number | null;
  paidAdditionalSeats: number;
  activeSeatsUsed: number;
}): number {
  // A tariff with no stated seat baseline cannot say how many of the occupied seats are extra;
  // billing what was already paid is the only non-guessing answer.
  if (input.includedSeats === null) return input.paidAdditionalSeats;
  return Math.max(
    0,
    Math.min(input.paidAdditionalSeats, input.activeSeatsUsed - input.includedSeats),
  );
}

/**
 * ОДИН счёт на следующий период — тариф плюс места по полной цене, никогда два счёта.
 * Mid-period proration belongs to the seat purchase alone; a full period is billed in full.
 *
 * `carriedDebtMinor` — долг за место, не закрытый к концу предыдущего периода (решение владельца
 * 19.08: «Если до конца периода счет не оплачен — делать его просроченным и включать долг в
 * стоимость следующего периода»). Поле ОБЯЗАТЕЛЬНОЕ намеренно: счёт следующего периода выставляют
 * две двери (клиника сама и фоновый тик), и новая дверь, забывшая про долг, обязана не собираться,
 * а не тихо выставлять сумму без него.
 */
export function saasBillingPeriodAmountMinor(input: {
  tariffPriceMinor: number;
  additionalSeatPriceMinor: number | null;
  additionalSeatQuantity: number;
  carriedDebtMinor: number;
}): number {
  if (input.additionalSeatQuantity > 0 && input.additionalSeatPriceMinor === null) {
    throw new Error('saas_billing_additional_seat_price_missing');
  }
  if (!Number.isInteger(input.carriedDebtMinor) || input.carriedDebtMinor < 0) {
    throw new Error('saas_billing_carried_debt_invalid');
  }
  return (
    input.tariffPriceMinor +
    input.additionalSeatQuantity * (input.additionalSeatPriceMinor ?? 0) +
    input.carriedDebtMinor
  );
}

/**
 * Сумма долга за места, переезжающая в счёт следующего периода.
 *
 * Складывать разрешено только одинаковую валюту: сумма счёта — одно число в одной валюте, и молча
 * сложенные рубли с чем-то ещё дадут правдоподобное неверное число. Расхождение — громкий отказ,
 * а не тихий пропуск строки: пропущенная строка означает прощённый долг.
 */
export function carriedSeatDebtMinor(input: {
  periodCurrency: string;
  debts: ReadonlyArray<{ amountMinor: number; currency: string }>;
}): number {
  let total = 0;
  for (const debt of input.debts) {
    if (debt.currency !== input.periodCurrency) {
      throw new Error('saas_billing_carried_debt_currency_mismatch');
    }
    total += debt.amountMinor;
  }
  return total;
}
