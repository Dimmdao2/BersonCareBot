import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

/**
 * VISIBILITY_MODEL_DESIGN_2026-08-04.md §3 — WHERE-fragment for list/aggregate queries, composed
 * the same way `appendSqlOrganizationEnrollment` is in pgDoctorClients.ts (input {sql, params} in,
 * wider {sql, params} out; a no-op when the actor may see the whole org). Lives in infra because
 * it emits SQL fragments for raw-query repos, not in the module layer (AGENTS.md §5 / S5 chokepoint).
 */
export function buildPatientVisibilityPredicate(
  input: { sql: string; params: unknown[] },
  patientUserIdColumn: string,
  organizationId: string,
  actor: PatientVisibilityActor,
): { sql: string; params: unknown[] } {
  if (actor.canManageAllSpecialists) {
    return input;
  }

  if (!actor.specialistId) {
    return { sql: `${input.sql} AND FALSE`, params: input.params };
  }

  const params = [...input.params, organizationId, actor.specialistId];
  return {
    sql: `${input.sql}
      AND EXISTS (
        SELECT 1 FROM patient_specialist_links psl_visibility
        WHERE psl_visibility.patient_user_id = ${patientUserIdColumn}
          AND psl_visibility.organization_id = $${params.length - 1}::uuid
          AND psl_visibility.specialist_id = $${params.length}::uuid
          AND psl_visibility.status = 'active'
      )`,
    params,
  };
}
