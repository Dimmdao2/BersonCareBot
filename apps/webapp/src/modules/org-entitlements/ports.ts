/**
 * Store P0 — entitlement foundation (dormant). Read-only port; P0 has no write path (tariff
 * assignment / override authoring is P2 global-admin UI). See STORE_P0_ENTITLEMENTS_PLAN.md.
 */
import type {
  AccessLifecyclePolicy,
  CabinetAccessResolution,
  EffectiveOrgCommercialAccess,
  MechanicAccessResolution,
  MechanicAccessPolicyMap,
  OrgCommercialAccessState,
  OrgEntitlementSnapshot,
  OrgMechanic,
  OrgEntitlementOverride,
  Tariff,
  TariffQuota,
  TariffQuotaMap,
  TrialPolicy,
} from './types';

export type OrgEntitlementsPort = {
  /** Separate system-level ladder for entry to the organization's cabinet (§5a/2.1a). */
  resolveCabinetAccess(organizationId: string): Promise<CabinetAccessResolution>;
  /** Canonical database-computed lifecycle state shared with the integrator. */
  resolveMechanicAccess(
    organizationId: string,
    mechanic: OrgMechanic,
  ): Promise<MechanicAccessResolution>;
  /** One server-authoritative effective snapshot used by mutation guards. */
  getSnapshot(organizationId: string): Promise<OrgEntitlementSnapshot>;
  /** Resolves the org's tariff via be_organizations.tariff_id. Null when unset (no tariff assigned). */
  getTariffForOrg(
    organizationId: string,
  ): Promise<{
    mechanics: Record<string, boolean>;
    quotas?: TariffQuotaMap;
    systemAccessPolicy: AccessLifecyclePolicy | null;
    mechanicAccessPolicies: MechanicAccessPolicyMap;
    includedSeats: number | null;
  } | null>;
  /** Per-org, per-mechanic overrides. May be empty. */
  listOverrides(
    organizationId: string,
  ): Promise<
    {
      mechanic: string;
      enabled: boolean;
      quota?: TariffQuota | null;
      expiresAt?: string | null;
      seatLimitOverride: number | null;
    }[]
  >;
  getEffectiveCommercialAccess(organizationId: string): Promise<EffectiveOrgCommercialAccess>;
  /** Current usage only for quota keys that have a real database chokepoint. */
  getEnforcedQuotaUsage(organizationId: string): Promise<Partial<Record<OrgMechanic, number>>>;
  /**
   * §5a stage 6.1 — the clinic's own "used out of included" numbers, for the caller's own
   * organization. Reads the same tables and formulas as each mechanic's write-path quota check
   * (`stockQuotaCheck.ts` callers), under the ordinary staff principal — every source table is
   * already row-level-security-scoped to the caller's own organization, so this needs no platform
   * (`app_platform_settings`) privilege the way `getEnforcedQuotaUsage` does.
   */
  getOwnQuotaUsage(organizationId: string): Promise<Partial<Record<OrgMechanic, number>>>;
};

export type PlatformMutationAudit = { actorId: string | null; reason: string };
export type PlatformTrialStatus = 'active' | 'grace' | 'expired' | 'ended';
export type PlatformOrganizationSummary = {
  id: string;
  title: string;
  tariffId: string | null;
  /** Explicit operator assignment; excludes the tariff persisted for a live trial. */
  manualTariffId: string | null;
  isActive: boolean;
  commercialAccessState: OrgCommercialAccessState;
  effectiveAccess: EffectiveOrgCommercialAccess;
  overrides: OrgEntitlementOverride[];
  trial: {
    id: string;
    tariffId: string;
    status: PlatformTrialStatus;
    startedAt: string;
    endsAt: string;
    graceEndsAt: string;
  } | null;
};

export type PlatformEntitlementsPort = {
  listTariffs(): Promise<Tariff[]>;
  listOrganizations(): Promise<PlatformOrganizationSummary[]>;
  getTrialPolicy(): Promise<TrialPolicy | null>;
  createTariff(
    input: Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>,
    audit: PlatformMutationAudit,
  ): Promise<Tariff>;
  updateTariff(
    id: string,
    input: Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>,
    audit: PlatformMutationAudit,
  ): Promise<Tariff>;
  archiveTariff(id: string, audit: PlatformMutationAudit): Promise<void>;
  /**
   * Real, current usage for the numeric (`запас`/`объём`) mechanics — used ONLY to evaluate
   * §5a stage 4b.3's downgrade guard before a tariff switch. Same counts as each mechanic's own
   * write-path check (`assertStockQuotaAvailable` callers), read outside that transaction.
   */
  getOrganizationMechanicUsage(organizationId: string): Promise<Partial<Record<OrgMechanic, number>>>;
  assignTariff(
    organizationId: string,
    tariffId: string | null,
    audit: PlatformMutationAudit,
  ): Promise<void>;
  upsertOverride(
    input: {
      organizationId: string;
      mechanic: OrgMechanic;
      enabled: boolean;
      quota: TariffQuota | null;
      expiresAt: string | null;
    },
    audit: PlatformMutationAudit,
  ): Promise<void>;
  deleteOverride(
    organizationId: string,
    mechanic: OrgMechanic,
    audit: PlatformMutationAudit,
  ): Promise<void>;
  setTrialPolicy(policy: TrialPolicy, audit: PlatformMutationAudit): Promise<void>;
  startTrial(
    organizationId: string,
    audit: PlatformMutationAudit,
  ): Promise<{ created: boolean; endsAt: string } | null>;
  extendTrial(
    organizationId: string,
    days: number,
    audit: PlatformMutationAudit,
  ): Promise<{ endsAt: string }>;
};
