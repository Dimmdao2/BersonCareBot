/**
 * §5a item 7.0 — КОНЕЦ ОПЛАЧЕННОГО ПЕРИОДА, источник события для лестницы доступа.
 *
 * До этой работы лестница знала ровно один якорь — истёкший триал, поэтому «клиника не заплатила за
 * период» физически не двигало её ни на одну ступень: `saas_billing_subscriptions.current_period_ends_at`
 * не писал ни один продуктовый путь. Здесь живёт правило, которое превращает назначение тарифа в
 * оплаченный период с концом.
 *
 * Длительность периода — НЕ выбор агента: это `saas_tariffs.billing_period`, поле владельца в
 * конструкторе тарифа. Здесь только календарная арифметика: `day`, `month`, `year` — это единицы, а не
 * политика (§5a item 2.6 запрещает агентские длительности, а не названия единиц измерения).
 */

/** The owner's tariff billing period. Mirrors `saas_tariffs_billing_period_check`. */
export type SaasBillingPeriod = 'day' | 'month' | 'year';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTHS_PER_YEAR = 12;

/**
 * End of the paid period that starts at `startsAt` and runs for one `billingPeriod`.
 *
 * Calendar months are added by component and the day is CLAMPED to the target month's length, which
 * is what PostgreSQL's `+ interval '1 month'` does: a period starting 31 January ends 28 (or 29)
 * February, not 3 March. Getting this wrong would silently hand a clinic extra paid days, so it is
 * arithmetic worth stating rather than a millisecond multiplication.
 */
export function paidPeriodEndsAt(startsAt: string, billingPeriod: SaasBillingPeriod): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`saas_billing_paid_period_start_invalid:${startsAt}`);
  }
  if (billingPeriod === 'day') {
    return new Date(start.getTime() + MILLISECONDS_PER_DAY).toISOString();
  }

  const addedMonths = billingPeriod === 'year' ? MONTHS_PER_YEAR : 1;
  const absoluteMonth = start.getUTCMonth() + addedMonths;
  const targetYear = start.getUTCFullYear() + Math.floor(absoluteMonth / MONTHS_PER_YEAR);
  const targetMonth = ((absoluteMonth % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
  // Day 0 of the NEXT month is the last day of the target month.
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(start.getUTCDate(), daysInTargetMonth),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  ).toISOString();
}
