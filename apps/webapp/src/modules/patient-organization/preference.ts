export const PATIENT_ORGANIZATION_PREFERENCE_COOKIE = "bc_patient_organization";

export function normalizePatientOrganizationPreference(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
