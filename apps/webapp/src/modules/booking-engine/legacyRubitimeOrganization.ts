/**
 * The unscoped legacy Rubitime catalog belongs exclusively to the migrated
 * single-clinic organization. Other tenants use the canonical org-scoped catalog.
 */
export const LEGACY_RUBITIME_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

export function isLegacyRubitimeOrganization(organizationId: string): boolean {
  return organizationId === LEGACY_RUBITIME_ORGANIZATION_ID;
}
