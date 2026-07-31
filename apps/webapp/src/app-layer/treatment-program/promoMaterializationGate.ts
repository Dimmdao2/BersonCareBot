import { canMaterializePatientMechanicOnRead } from '@/app-layer/entitlements/readMaterializationGate';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';

type PatientOrganizationDeps = Parameters<typeof resolvePatientEnrollmentOrganizationId>[0];

export async function canMaterializePromoForPatient(
  deps: PatientOrganizationDeps,
  patientUserId: string,
): Promise<boolean> {
  return canMaterializePatientMechanicOnRead(deps, patientUserId, 'promo');
}
