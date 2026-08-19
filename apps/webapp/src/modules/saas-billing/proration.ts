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
 */
export function saasBillingPeriodAmountMinor(input: {
  tariffPriceMinor: number;
  additionalSeatPriceMinor: number | null;
  additionalSeatQuantity: number;
}): number {
  if (input.additionalSeatQuantity > 0 && input.additionalSeatPriceMinor === null) {
    throw new Error('saas_billing_additional_seat_price_missing');
  }
  return (
    input.tariffPriceMinor + input.additionalSeatQuantity * (input.additionalSeatPriceMinor ?? 0)
  );
}
