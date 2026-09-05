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

/**
 * #1069 owner decision 2026-09-05 (period grid) — one tariff's amount for one globally selectable
 * period. `discountedPriceMinor` mirrors {@link import('../org-entitlements/types').Tariff.discountedPriceMinor}'s
 * shape (Т8: exact price, `null` = no discount), now per period instead of once per tariff.
 */
export type TariffPeriodPrice = {
  billingPeriodCode: string;
  priceMinor: number;
  discountedPriceMinor: number | null;
};

/**
 * A platform tariff save writes the COMPLETE matrix in one call: exactly one row per currently
 * selectable period, no unknown code, no duplicate, no negative amount. Called by BOTH the write
 * path (`createTariff`/`updateTariff`) and the completeness gate a period activation runs, so the
 * two can never silently disagree on what "complete" means.
 */
export function assertCompleteTariffPeriodPriceMatrix(
  periodPrices: readonly TariffPeriodPrice[],
  selectablePeriodCodes: readonly string[],
): void {
  const seen = new Set<string>();
  for (const row of periodPrices) {
    if (seen.has(row.billingPeriodCode)) {
      throw new Error(`saas_tariff_period_price_duplicate:${row.billingPeriodCode}`);
    }
    seen.add(row.billingPeriodCode);
    if (!selectablePeriodCodes.includes(row.billingPeriodCode)) {
      throw new Error(`saas_tariff_period_price_unknown_period:${row.billingPeriodCode}`);
    }
    if (!Number.isInteger(row.priceMinor) || row.priceMinor < 0) {
      throw new Error(`saas_tariff_period_price_invalid:${row.billingPeriodCode}`);
    }
    if (
      row.discountedPriceMinor !== null &&
      (!Number.isInteger(row.discountedPriceMinor) || row.discountedPriceMinor < 0)
    ) {
      throw new Error(`saas_tariff_period_price_discount_invalid:${row.billingPeriodCode}`);
    }
  }
  const missing = selectablePeriodCodes.filter((code) => !seen.has(code));
  if (missing.length > 0) {
    throw new Error(`saas_tariff_period_price_missing:${missing.join(',')}`);
  }
}

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
