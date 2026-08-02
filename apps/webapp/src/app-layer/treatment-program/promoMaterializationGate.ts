import { canMaterializePatientMechanicOnRead } from '@/app-layer/entitlements/readMaterializationGate';
import { getMechanicSurfaceVisibility } from '@/app-layer/guards/requireEntitlement';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';

type PatientOrganizationDeps = Parameters<typeof resolvePatientEnrollmentOrganizationId>[0];

export async function canMaterializePromoForPatient(
  deps: PatientOrganizationDeps,
  patientUserId: string,
): Promise<boolean> {
  return canMaterializePatientMechanicOnRead(deps, patientUserId, 'promo');
}

/**
 * Promo has two distinct decisions: disabled hides even existing instances, while read-only
 * keeps them readable but never permits lazy materialization.
 */
export async function resolvePromoAccessForPatient(
  deps: PatientOrganizationDeps,
  patientUserId: string,
): Promise<{ visible: boolean; canMaterialize: boolean }> {
  const tenant = await resolvePatientEnrollmentOrganizationId(deps, patientUserId);
  if (!tenant.ok) return { visible: false, canMaterialize: false };

  const visibility = await getMechanicSurfaceVisibility(
    { organizationId: tenant.organizationId },
    'promo',
  );
  if (!visibility.patientNavigation) return { visible: false, canMaterialize: false };

  return {
    visible: true,
    canMaterialize: await canMaterializePromoForPatient(deps, patientUserId),
  };
}
