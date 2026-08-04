import type { PatientVisibilityActor, PatientVisibilityLinkPort } from './ports';

/**
 * VISIBILITY_MODEL_DESIGN_2026-08-04.md §3 — the one chokepoint every patient-data read is meant
 * to route through (Stage E, not wired yet — see brief). Two functions:
 *
 * - `buildPatientVisibilityPredicate` — WHERE-fragment for list/aggregate queries, composed the
 *   same way `appendSqlOrganizationEnrollment` already is in pgDoctorClients.ts (input {sql,
 *   params} in, wider {sql, params} out; a no-op when the actor may see the whole org).
 * - `assertPatientVisibleToActor` — point check for single-patient reads (card, files, notes),
 *   backed by a port so the module stays clear of infra per AGENTS.md §5.
 *
 * The tenant wall (RLS, `organization_id = app.current_org_id()`) is not replaced by either
 * function — both take `organizationId` explicitly and fold it into the narrowed branch, so a
 * link that belongs to another organization can never satisfy either check even if a caller's own
 * org filter were missing (design doc §3: "порт сужает внутри организации, а не заменяет
 * межклиниковую границу").
 */

export function buildPatientVisibilityPredicate(
  input: { sql: string; params: unknown[] },
  patientUserIdColumn: string,
  organizationId: string,
  actor: PatientVisibilityActor,
): { sql: string; params: unknown[] } {
  // Manager/owner/admin: org-wide, matches today's behavior — no narrowing.
  if (actor.canManageAllSpecialists) {
    return input;
  }

  // No bound specialist identity (bare doctor pre-bind, or an assistant — see ports.ts) — the
  // predicate cannot express "own patients" without a specialist to scope by, so it excludes
  // everything rather than silently falling back to org-wide.
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

export function createPatientVisibilityService(deps: { linkPort: PatientVisibilityLinkPort }) {
  return {
    buildVisibilityPredicate: buildPatientVisibilityPredicate,

    async assertPatientVisibleToActor(params: {
      patientUserId: string;
      organizationId: string;
      actor: PatientVisibilityActor;
    }): Promise<boolean> {
      if (params.actor.canManageAllSpecialists) {
        return true;
      }
      if (!params.actor.specialistId) {
        return false;
      }
      return deps.linkPort.hasActiveLink({
        organizationId: params.organizationId,
        patientUserId: params.patientUserId,
        specialistId: params.actor.specialistId,
      });
    },
  };
}

export type PatientVisibilityService = ReturnType<typeof createPatientVisibilityService>;
