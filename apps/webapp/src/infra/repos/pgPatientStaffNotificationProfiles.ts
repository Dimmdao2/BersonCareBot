import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import {
  parseStaffNotificationProfiles,
  type StoredProfilesResult,
} from '@/infra/repos/staffNotificationProfilePayload';
import type { PatientStaffNotificationProfilesPort } from '@/modules/doctor-notifications/patientStaffNotificationProfilesPort';

export function createPgPatientStaffNotificationProfilesPort(): PatientStaffNotificationProfilesPort {
  return {
    async listForCurrentPatientOrganization({ organizationId, topicCode }) {
      if (getCurrentDbPrincipal()?.kind !== 'patient') return null;
      if (getCurrentDbPrincipalOrganizationId() !== organizationId) {
        throw new Error('patient_notification_organization_mismatch');
      }
      const result = await runWebappNamedRoot<{ result: StoredProfilesResult }>(
        getWebappSqlDb(),
        'app.read_current_patient_staff_notification_profiles(uuid,text)',
        [organizationId, topicCode],
        sql`SELECT app.read_current_patient_staff_notification_profiles(
          ${organizationId}::uuid,
          ${topicCode}::text
        ) AS result`,
      );
      return parseStaffNotificationProfiles(result.rows[0]?.result, 'patient_staff_profiles_failed');
    },
  };
}
