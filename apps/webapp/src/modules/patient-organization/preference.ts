export const PATIENT_ORGANIZATION_PREFERENCE_COOKIE = 'bc_patient_organization';
/** Short-lived, httpOnly evidence that the trusted opener changed the visible organization. */
export const PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE = 'bc_patient_organization_change_receipt';

export function normalizePatientOrganizationPreference(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}
