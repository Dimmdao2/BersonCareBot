/**
 * Dormant S4-0 access-source contract. No table, billing flow, or assignment
 * write path is introduced here; S4-4 must make these sources one resolver.
 */
export type EffectiveTariffSource =
  | Readonly<{ kind: "manual"; tariffId: string }>
  | Readonly<{ kind: "paid_subscription"; tariffId: string; subscriptionId: string }>;

export type EffectiveTariffAccess = Readonly<{
  organizationId: string;
  compatibilityTariffId: string | null;
  source: EffectiveTariffSource | null;
}>;

export function compatibilityTariffProjection(access: EffectiveTariffAccess): string | null {
  return access.source?.tariffId ?? access.compatibilityTariffId;
}

export function isEffectiveTariffProjectionConsistent(access: EffectiveTariffAccess): boolean {
  return access.source === null || access.compatibilityTariffId === access.source.tariffId;
}
