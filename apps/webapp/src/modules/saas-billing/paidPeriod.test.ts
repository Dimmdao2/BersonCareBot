import { describe, expect, it } from 'vitest';
import {
  LEGACY_BILLING_PERIOD_DAY,
  paidPeriodEndsAtForCode,
  paidPeriodEndsAtFromMonths,
} from './billingPeriodCatalog';

const catalog = new Map([
  ['month', 1],
  ['half_year', 6],
  ['year', 12],
]);

describe('paidPeriodEndsAtFromMonths', () => {
  it('adds one calendar month with day clamping like Postgres', () => {
    expect(paidPeriodEndsAtFromMonths('2026-01-31T12:00:00.000Z', 1)).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });

  it('adds six months for half-year catalog codes', () => {
    expect(paidPeriodEndsAtForCode('2026-03-15T00:00:00.000Z', 'half_year', catalog)).toBe(
      '2026-09-15T00:00:00.000Z',
    );
  });

  it('still understands retired day snapshots without shifting live month/year tariffs', () => {
    expect(paidPeriodEndsAtForCode('2026-03-15T00:00:00.000Z', LEGACY_BILLING_PERIOD_DAY, catalog)).toBe(
      '2026-03-16T00:00:00.000Z',
    );
  });

  it('rejects unknown catalog codes', () => {
    expect(() => paidPeriodEndsAtForCode('2026-03-15T00:00:00.000Z', 'quarter', catalog)).toThrow(
      'saas_billing_period_unknown:quarter',
    );
  });
});
