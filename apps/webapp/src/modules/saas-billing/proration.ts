/**
 * The proration amount is always rounded up to a whole minor unit.  This is deterministic and
 * means a positive upgrade never silently becomes free because its proportional remainder is a
 * fraction of one minor unit.
 */
export function proratedTariffUpgradeAmountMinor(input: {
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
