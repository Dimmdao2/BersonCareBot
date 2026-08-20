import { describe, expect, it } from 'vitest';
import { resolveCommercialAccess } from './commercialAccessComputation';
import { resolveAccess } from './pgOrgEntitlements';
import { effectiveAccessForPlatform } from './pgPlatformEntitlements';

/**
 * #1069 §5a Т5-Т8 (owner 03.08) — behavioral proof for the TS mirrors of the patient-projection
 * access computation (`resolveAccess` / `effectiveAccessForPlatform`; the SQL door itself is proved
 * by the named-DEV role/catalog and live access-ladder pass). Both take the SAME
 * shaped trial record the database now stores: no own `tariffId` binding beyond the one recorded at
 * trial creation, and no `graceEndsAt` at all.
 */
const TARIFF_ID = '10000000-0000-4000-8000-000000000001';
const POST_TRIAL_TARIFF_ID = '10000000-0000-4000-8000-000000000002';
const ENDS_AT = '2026-08-01T00:00:00.000Z';
const ENDS_AT_MS = Date.parse(ENDS_AT);

function trial(postTrialBehavior: 'blocked' | 'read_only' | 'tariff') {
  return {
    tariffId: TARIFF_ID,
    endsAt: ENDS_AT,
    postTrialBehavior,
    postTrialTariffId: postTrialBehavior === 'tariff' ? POST_TRIAL_TARIFF_ID : null,
  };
}

describe.each([
  ['resolveAccess (staff/org snapshot)', (behavior: 'blocked' | 'read_only' | 'tariff', now: number) =>
    resolveAccess({ organizationTariffId: TARIFF_ID, trial: trial(behavior), now })],
  [
    'effectiveAccessForPlatform (admin console)',
    (behavior: 'blocked' | 'read_only' | 'tariff', now: number) =>
      effectiveAccessForPlatform({
        tariffId: TARIFF_ID,
        trial: { ...trial(behavior), status: 'active' } as never,
        now,
      }),
  ],
])('%s', (_label, resolve) => {
  it('keeps full active access while the trial has not ended yet', () => {
    const access = resolve('blocked', ENDS_AT_MS - 1000);
    expect(access.lifecycle).toBe('active');
    expect(access.source).toBe('trial');
    expect(access.tariffId).toBe(TARIFF_ID);
  });

  // Breakage: a trial-extension `grace` stage reappears between `endsAt` and the post-trial rule,
  // keeping full access alive past the moment the owner said it must end.
  it('applies "blocked" the instant endsAt passes, with no intermediate grace stage', () => {
    const access = resolve('blocked', ENDS_AT_MS + 1000);
    expect(access.lifecycle).toBe('blocked');
  });

  it('applies "read_only" the instant endsAt passes, with no intermediate grace stage', () => {
    const access = resolve('read_only', ENDS_AT_MS + 1000);
    expect(access.lifecycle).toBe('read_only');
  });

  it('applies the configured post-trial tariff the instant endsAt passes', () => {
    const access = resolve('tariff', ENDS_AT_MS + 1000);
    expect(access.lifecycle).toBe('active');
    expect(access.source).toBe('post_trial_tariff');
    expect(access.tariffId).toBe(POST_TRIAL_TARIFF_ID);
  });

  // Breakage: passage of time within what would have been a discount-payment window (days or
  // years past endsAt) silently restores access — proving the window is truly orthogonal to
  // access, not just absent from a single instant right after endsAt.
  it('keeps the post-trial rule in force arbitrarily far past endsAt (a discount window never restores access)', () => {
    const oneYearPastEnds = ENDS_AT_MS + 365 * 86_400_000;
    expect(resolve('blocked', oneYearPastEnds).lifecycle).toBe('blocked');
    expect(resolve('read_only', oneYearPastEnds).lifecycle).toBe('read_only');
  });
});

const PERIOD_ENDS_AT = '2026-07-01T00:00:00.000Z';
const PERIOD_ENDS_AT_MS = Date.parse(PERIOD_ENDS_AT);
const POST_PAID_TARIFF_ID = '10000000-0000-4000-8000-000000000003';

function paidPeriod(behavior: 'read_only' | 'blocked' | 'tariff') {
  return {
    periodEndsAt: PERIOD_ENDS_AT,
    postPaidPeriodBehavior: behavior,
    postPaidPeriodTariffId: behavior === 'tariff' ? POST_PAID_TARIFF_ID : null,
  };
}

describe.each([
  [
    'resolveAccess (staff/org snapshot)',
    (behavior: 'read_only' | 'blocked' | 'tariff', now: number) =>
      resolveAccess({
        organizationTariffId: TARIFF_ID,
        trial: null,
        paidPeriod: paidPeriod(behavior),
        now,
      }),
  ],
  [
    'effectiveAccessForPlatform (admin console)',
    (behavior: 'read_only' | 'blocked' | 'tariff', now: number) =>
      effectiveAccessForPlatform({
        tariffId: TARIFF_ID,
        trial: null,
        paidPeriod: paidPeriod(behavior),
        now,
      }),
  ],
  [
    'resolveCommercialAccess (shared resolver)',
    (behavior: 'read_only' | 'blocked' | 'tariff', now: number) =>
      resolveCommercialAccess({
        organizationTariffId: TARIFF_ID,
        trial: null,
        paidPeriod: paidPeriod(behavior),
        now,
      }),
  ],
])('%s — post-paid period policy', (_label, resolve) => {
  it('keeps full active access while the paid period has not ended yet', () => {
    const access = resolve('read_only', PERIOD_ENDS_AT_MS - 1000);
    expect(access.lifecycle).toBe('active');
    expect(access.source).toBe('assignment');
    expect(access.tariffId).toBe(TARIFF_ID);
  });

  it('applies read_only the instant the paid period ends', () => {
    const access = resolve('read_only', PERIOD_ENDS_AT_MS + 1000);
    expect(access.lifecycle).toBe('read_only');
    expect(access.source).toBe('assignment');
    expect(access.degradationStartedAt).toBe(PERIOD_ENDS_AT);
  });

  it('applies blocked the instant the paid period ends', () => {
    const access = resolve('blocked', PERIOD_ENDS_AT_MS + 1000);
    expect(access.lifecycle).toBe('blocked');
  });

  it('applies the configured post-paid tariff the instant the paid period ends', () => {
    const access = resolve('tariff', PERIOD_ENDS_AT_MS + 1000);
    expect(access.lifecycle).toBe('active');
    expect(access.source).toBe('post_paid_period_tariff');
    expect(access.tariffId).toBe(POST_PAID_TARIFF_ID);
  });
});

describe('T10/T13 — global paid-period outcome is tariff-independent', () => {
  it.each([
    TARIFF_ID,
    '10000000-0000-4000-8000-000000000099',
  ])('returns the same read_only result for tariff %s regardless of its local policy JSON', (tariffId) => {
    const access = resolveCommercialAccess({
      organizationTariffId: tariffId,
      trial: null,
      paidPeriod: paidPeriod('read_only'),
      now: PERIOD_ENDS_AT_MS + 1000,
    });

    expect(access).toMatchObject({
      lifecycle: 'read_only',
      tariffId,
      source: 'assignment',
    });
  });
});
