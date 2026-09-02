import { sql, type SQL } from 'drizzle-orm';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

/**
 * VISIBILITY_MODEL_DESIGN_2026-08-04.md §3 — WHERE-fragment for list/aggregate queries, composed
 * the same way `appendSqlOrganizationEnrollment` is in pgDoctorClients.ts (fragment in, wider
 * fragment out; a no-op when the actor may see the whole org). Lives in infra because it emits
 * SQL fragments for query-building repos, not in the module layer (AGENTS.md §5 / S5 chokepoint).
 *
 * `patientUserIdColumn` is a caller-owned column identifier and stays raw; the organization and
 * specialist ids are bound.
 */
export function buildPatientVisibilityPredicate(
  input: SQL,
  patientUserIdColumn: string,
  organizationId: string,
  actor: PatientVisibilityActor,
): SQL {
  if (actor.canManageAllSpecialists) {
    return input;
  }

  if (!actor.specialistId) {
    return sql`${input} AND FALSE`;
  }

  return sql`${input}
      AND EXISTS (
        SELECT 1 FROM patient_specialist_links psl_visibility
        WHERE psl_visibility.patient_user_id = ${sql.raw(patientUserIdColumn)}
          AND psl_visibility.organization_id = ${organizationId}::uuid
          AND psl_visibility.specialist_id = ${actor.specialistId}::uuid
          AND psl_visibility.status = 'active'
      )`;
}
