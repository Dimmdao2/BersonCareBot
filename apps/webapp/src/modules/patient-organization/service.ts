import type { PatientOrganizationPort } from "./ports";

export type PatientOrganizationResolution =
  | { ok: true; organizationId: string }
  | { ok: false; reason: "no_active_enrollment" }
  | { ok: false; reason: "organization_selection_required"; organizationIds: string[] };

export function createPatientOrganizationService(deps: { port: PatientOrganizationPort }) {
  return {
    async resolveActiveOrganizationForPatient(platformUserId: string): Promise<PatientOrganizationResolution> {
      const rows = await deps.port.listActiveEnrollmentsByPlatformUser(platformUserId);
      if (rows.length === 0) {
        return { ok: false, reason: "no_active_enrollment" };
      }

      const organizationIds = [...new Set(rows.map((row) => row.organizationId))];
      if (organizationIds.length > 1) {
        return { ok: false, reason: "organization_selection_required", organizationIds };
      }

      return { ok: true, organizationId: organizationIds[0] };
    },
  };
}

export type PatientOrganizationService = ReturnType<typeof createPatientOrganizationService>;
