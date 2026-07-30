import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';

type PatientOrganizationDeps = Parameters<typeof resolvePatientEnrollmentOrganizationId>[0];

export async function canMaterializePromoForPatient(
  deps: PatientOrganizationDeps,
  patientUserId: string,
): Promise<boolean> {
  const tenant = await resolvePatientEnrollmentOrganizationId(deps, patientUserId);
  if (!tenant.ok) return false;
  return (await requireEntitlementForMutation({ organizationId: tenant.organizationId }, 'promo'))
    .ok;
}
