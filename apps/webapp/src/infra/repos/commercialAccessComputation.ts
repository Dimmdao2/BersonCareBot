import type { EffectiveOrgCommercialAccess } from '@/modules/org-entitlements/types';

export type CommercialAccessTrialInput = {
  tariffId: string;
  endsAt: string;
  postTrialBehavior: string;
  postTrialTariffId: string | null;
} | null;

export type CommercialAccessPaidPeriodInput = {
  periodEndsAt: string;
  postPaidPeriodBehavior: 'read_only' | 'blocked' | 'tariff';
  postPaidPeriodTariffId: string | null;
} | null;

/**
 * TS mirror of `app.read_current_patient_organization_entitlements()` effective access
 * (migration 0376): trial first, then post-paid period policy after `periodEndsAt`.
 */
export function resolveCommercialAccess(input: {
  organizationTariffId: string | null;
  trial: CommercialAccessTrialInput;
  paidPeriod: CommercialAccessPaidPeriodInput;
  now: number;
}): EffectiveOrgCommercialAccess {
  const { trial, paidPeriod } = input;

  if (trial) {
    const trialDates = {
      trialEndsAt: trial.endsAt,
      degradationStartedAt: trial.endsAt,
    };
    if (input.now <= new Date(trial.endsAt).getTime()) {
      return { lifecycle: 'active', tariffId: trial.tariffId, source: 'trial', ...trialDates };
    }
    // #1069 Т5-Т8 (owner 03.08): the post-trial rule applies the instant `endsAt` passes — no
    // further access-extending `grace` stage.
    if (trial.postTrialBehavior === 'tariff') {
      return {
        lifecycle: 'active',
        tariffId: trial.postTrialTariffId,
        source: 'post_trial_tariff',
        ...trialDates,
      };
    }
    return {
      lifecycle: trial.postTrialBehavior === 'blocked' ? 'blocked' : 'read_only',
      tariffId: trial.tariffId,
      source: 'trial',
      ...trialDates,
    };
  }

  if (paidPeriod && input.now >= new Date(paidPeriod.periodEndsAt).getTime()) {
    const degradationStartedAt = paidPeriod.periodEndsAt;
    if (paidPeriod.postPaidPeriodBehavior === 'tariff') {
      return {
        lifecycle: 'active',
        tariffId: paidPeriod.postPaidPeriodTariffId,
        source: 'post_paid_period_tariff',
        degradationStartedAt,
      };
    }
    return {
      lifecycle: paidPeriod.postPaidPeriodBehavior === 'blocked' ? 'blocked' : 'read_only',
      tariffId: input.organizationTariffId,
      source: 'assignment',
      degradationStartedAt,
    };
  }

  return {
    lifecycle: 'active',
    tariffId: input.organizationTariffId,
    source: 'assignment',
  };
}
