import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import type { OrgMechanic } from '@/modules/org-entitlements/types';

type PatientOrganizationDeps = Parameters<typeof resolvePatientEnrollmentOrganizationId>[0];

/**
 * A read remains available when a mechanic is disabled, but it must not lazily
 * materialize missing state. Callers use this decision only to omit write-capable
 * dependencies; they must still return the existing read model.
 */
export async function canMaterializeMechanicOnRead(
  organizationId: string,
  mechanic: OrgMechanic,
): Promise<boolean> {
  return (await requireEntitlementForMutation({ organizationId }, mechanic)).ok;
}

export async function canMaterializePatientMechanicOnRead(
  deps: PatientOrganizationDeps,
  patientUserId: string,
  mechanic: OrgMechanic,
): Promise<boolean> {
  const tenant = await resolvePatientEnrollmentOrganizationId(deps, patientUserId);
  if (!tenant.ok) return false;
  return canMaterializeMechanicOnRead(tenant.organizationId, mechanic);
}
