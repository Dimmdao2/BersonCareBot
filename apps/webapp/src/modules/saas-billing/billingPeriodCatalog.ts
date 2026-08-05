/**
 * #1069 T9 — billing period length comes from `saas_billing_periods`, not a closed TS union.
 * Historical invoice rows may still reference retired `day`; that code stays in the catalog with
 * `isSelectable = false` so existing paid-period ends never move.
 */

export type BillingPeriodOption = {
  code: string;
  label: string;
  months: number;
  isSelectable: boolean;
  sortOrder: number;
};

/** Retired period code kept only for historical invoice/tariff snapshots. */
export const LEGACY_BILLING_PERIOD_DAY = 'day';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTHS_PER_YEAR = 12;

export function paidPeriodEndsAtFromMonths(startsAt: string, periodMonths: number): string {
  if (!Number.isInteger(periodMonths) || periodMonths <= 0) {
    throw new Error(`saas_billing_period_months_invalid:${periodMonths}`);
  }
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`saas_billing_paid_period_start_invalid:${startsAt}`);
  }

  const absoluteMonth = start.getUTCMonth() + periodMonths;
  const targetYear = start.getUTCFullYear() + Math.floor(absoluteMonth / MONTHS_PER_YEAR);
  const targetMonth = ((absoluteMonth % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
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

export function paidPeriodEndsAtForCode(
  startsAt: string,
  code: string,
  monthsByCode: ReadonlyMap<string, number>,
): string {
  if (code === LEGACY_BILLING_PERIOD_DAY) {
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) {
      throw new Error(`saas_billing_paid_period_start_invalid:${startsAt}`);
    }
    return new Date(start.getTime() + MILLISECONDS_PER_DAY).toISOString();
  }
  const months = monthsByCode.get(code);
  if (months === undefined) {
    throw new Error(`saas_billing_period_unknown:${code}`);
  }
  return paidPeriodEndsAtFromMonths(startsAt, months);
}

export function billingPeriodMonthsMap(
  options: readonly BillingPeriodOption[],
): ReadonlyMap<string, number> {
  return new Map(options.map((option) => [option.code, option.months]));
}

const KNOWN_BILLING_PERIOD_LABELS_RU: Record<string, string> = {
  day: 'день',
  month: 'месяц',
  half_year: 'полгода',
  year: 'год',
};

/** Display label for invoice breakdown rows; unknown codes fall back to the code itself. */
export function formatBillingPeriodLabelRu(code: string): string {
  return KNOWN_BILLING_PERIOD_LABELS_RU[code] ?? code;
}
