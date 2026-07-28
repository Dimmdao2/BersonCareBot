import { cookies } from 'next/headers';
import { enterWithDbPatientPrincipal } from '@bersoncare/db-principal';
import type {
  PatientOrganizationResolution,
  PatientOrganizationService,
} from '@/modules/patient-organization/service';
import {
  normalizePatientOrganizationPreference,
  PATIENT_ORGANIZATION_PREFERENCE_COOKIE,
} from '@/modules/patient-organization/preference';

export async function getRememberedPatientOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  return normalizePatientOrganizationPreference(
    cookieStore.get(PATIENT_ORGANIZATION_PREFERENCE_COOKIE)?.value,
  );
}

export async function resolvePatientOrganizationRequestContext(
  patientOrganization: PatientOrganizationService | null,
  platformUserId: string,
  options: {
    rememberedOrganizationId?: string | null;
    verifiedTargetOrganizationId?: string | null;
  } = {},
): Promise<
  PatientOrganizationResolution | { ok: false; reason: 'patient_organization_unavailable' }
> {
  if (!patientOrganization) return { ok: false, reason: 'patient_organization_unavailable' };
  const rememberedOrganizationId =
    options.rememberedOrganizationId === undefined
      ? await getRememberedPatientOrganizationId()
      : normalizePatientOrganizationPreference(options.rememberedOrganizationId);
  return patientOrganization.resolveActiveOrganizationForPatient(platformUserId, {
    rememberedOrganizationId,
    verifiedTargetOrganizationId: options.verifiedTargetOrganizationId,
  });
}

export function stampPatientOrganizationRequestContext(input: {
  organizationId: string;
  platformUserId: string;
  source: string;
}): void {
  enterWithDbPatientPrincipal(input);
}
