/**
 * Store P0 — entitlement foundation (dormant). Read-only port; P0 has no write path (tariff
 * assignment / override authoring is P2 global-admin UI). See STORE_P0_ENTITLEMENTS_PLAN.md.
 */
import type {
  EffectiveOrgCommercialAccess,
  OrgCommercialAccessState,
  OrgMechanic,
  QuotaGrowthByUnit,
  QuotaReservationDecision,
  Tariff,
  TariffQuota,
  TariffQuotaMap,
  TrialPolicy,
} from "./types";

export type OrgEntitlementsPort = {
  /** Resolves the org's tariff via be_organizations.tariff_id. Null when unset (no tariff assigned). */
  getTariffForOrg(
    organizationId: string,
  ): Promise<{ mechanics: Record<string, boolean>; quotas?: TariffQuotaMap; includedSeats: number | null } | null>;
  /** Per-org, per-mechanic overrides. May be empty. */
  listOverrides(
    organizationId: string,
  ): Promise<{ mechanic: string; enabled: boolean; quota?: TariffQuota | null; expiresAt?: string | null; seatLimitOverride: number | null }[]>;
  getEffectiveCommercialAccess(organizationId: string): Promise<EffectiveOrgCommercialAccess>;
  reserveQuotaGrowth(
    organizationId: string,
    mechanic: OrgMechanic,
    growthByUnit: QuotaGrowthByUnit,
  ): Promise<QuotaReservationDecision>;
};

export type PlatformMutationAudit = { actorId: string | null; reason: string };
export type PlatformOrganizationSummary = {
  id: string;
  title: string;
  tariffId: string | null;
  isActive: boolean;
  commercialAccessState: OrgCommercialAccessState;
};

export type PlatformEntitlementsPort = {
  listTariffs(): Promise<Tariff[]>;
  listOrganizations(): Promise<PlatformOrganizationSummary[]>;
  getTrialPolicy(): Promise<TrialPolicy | null>;
  createTariff(input: Omit<Tariff, "id" | "createdAt" | "updatedAt">, audit: PlatformMutationAudit): Promise<Tariff>;
  updateTariff(id: string, input: Omit<Tariff, "id" | "createdAt" | "updatedAt">, audit: PlatformMutationAudit): Promise<Tariff>;
  archiveTariff(id: string, audit: PlatformMutationAudit): Promise<void>;
  assignTariff(organizationId: string, tariffId: string | null, audit: PlatformMutationAudit): Promise<void>;
  upsertOverride(input: { organizationId: string; mechanic: OrgMechanic; enabled: boolean; quota: TariffQuota | null; expiresAt: string | null }, audit: PlatformMutationAudit): Promise<void>;
  deleteOverride(organizationId: string, mechanic: OrgMechanic, audit: PlatformMutationAudit): Promise<void>;
  setTrialPolicy(policy: TrialPolicy, audit: PlatformMutationAudit): Promise<void>;
  startTrial(organizationId: string, audit: PlatformMutationAudit): Promise<{ created: boolean; endsAt: string } | null>;
  extendTrial(organizationId: string, days: number, audit: PlatformMutationAudit): Promise<{ endsAt: string }>;
};
