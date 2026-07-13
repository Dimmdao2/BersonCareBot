/**
 * Store P0 — entitlement foundation (dormant). Read-only port; P0 has no write path (tariff
 * assignment / override authoring is P2 global-admin UI). See STORE_P0_ENTITLEMENTS_PLAN.md.
 */
export type OrgEntitlementsPort = {
  /** Resolves the org's tariff via be_organizations.tariff_id. Null when unset (no tariff assigned). */
  getTariffForOrg(organizationId: string): Promise<{ mechanics: Record<string, boolean> } | null>;
  /** Per-org, per-mechanic overrides. May be empty. */
  listOverrides(organizationId: string): Promise<{ mechanic: string; enabled: boolean }[]>;
};
