import type { PatientVisibilityActor, PatientVisibilityLinkPort } from './ports';

/**
 * VISIBILITY_MODEL_DESIGN_2026-08-04.md §3 — the one chokepoint every patient-data read is meant
 * to route through (Stage E, not wired yet — see brief). Point checks for single-patient reads
 * (card, files, notes) go through `assertPatientVisibleToActor`, backed by a port so the module
 * stays clear of infra per AGENTS.md §5.
 *
 * List/aggregate WHERE-fragments (`buildPatientVisibilityPredicate`) live in
 * `infra/repos/patientVisibilityPredicateSql.ts` — same layering as
 * `appendSqlOrganizationEnrollment` in pgDoctorClients.ts.
 *
 * The tenant wall (RLS, `organization_id = app.current_org_id()`) is not replaced by either
 * function — both take `organizationId` explicitly and fold it into the narrowed branch, so a
 * link that belongs to another organization can never satisfy either check even if a caller's own
 * org filter were missing (design doc §3: "порт сужает внутри организации, а не заменяет
 * межклиниковую границу").
 */

export function createPatientVisibilityService(deps: { linkPort: PatientVisibilityLinkPort }) {
  return {
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
