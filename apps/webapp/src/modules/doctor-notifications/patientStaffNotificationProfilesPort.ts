import type { StaffNotificationProfile } from './staffNotificationProfile';

/**
 * Patient-only projection used when a patient event must fan out to staff in the same organization.
 * A non-patient request returns null so the existing staff-side ports remain the canonical path.
 */
export type PatientStaffNotificationProfilesPort = {
  listForCurrentPatientOrganization(input: {
    organizationId: string;
    topicCode: string;
  }): Promise<StaffNotificationProfile[] | null>;
};
