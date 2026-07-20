import { runWithWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type {
  PatientOrganizationEnrollment,
  PatientOrganizationPort,
} from "@/modules/patient-organization/ports";
import { orgEnrollments } from "../../../db/schema/bookingEngine";
type ActiveOrganizationRow = {
  organization_id: string;
  organization_title: string;
  platform_user_id: string;
  enrollment_created_at: Date | string;
};

function mapOrgEnrollment(row: ActiveOrganizationRow): PatientOrganizationEnrollment {
  return {
    organizationId: row.organization_id,
    organizationTitle: row.organization_title,
    platformUserId: row.platform_user_id,
    status: "active",
    organizationIsActive: true,
    createdAt: toIsoStringSafe(row.enrollment_created_at),
  };
}

export function createPgPatientOrganizationPort(): PatientOrganizationPort {
  return {
    async listActiveEnrollmentsByPlatformUser(platformUserId) {
      void platformUserId;
      const result = await runWithWebappDbOperationFamily("patient_ui_config", () =>
        runWebappPgText<ActiveOrganizationRow>(
          "SELECT * FROM app.read_current_patient_active_organizations()",
        ),
      );
      return result.rows.map(mapOrgEnrollment);
    },
    async hasActiveEnrollment(platformUserId, organizationId) {
      if (getCurrentDbPrincipalOrganizationId() !== organizationId) return false;
      const db = getDrizzle();
      const [row] = await db
        .select({ organizationId: orgEnrollments.organizationId })
        .from(orgEnrollments)
        .where(
          and(
            eq(orgEnrollments.organizationId, organizationId),
            eq(orgEnrollments.platformUserId, platformUserId),
            eq(orgEnrollments.status, "active"),
          ),
        )
        .limit(1);
      return row?.organizationId === organizationId;
    },
    async findTreatmentProgramOrganizationForPatient(platformUserId, instanceId) {
      void platformUserId;
      const result = await runWithWebappDbOperationFamily("patient_ui_config", () =>
        runWebappPgText<{ organization_id: string | null }>(
          "SELECT app.resolve_current_patient_treatment_program_organization($1::uuid) AS organization_id",
          [instanceId],
        ),
      );
      return result.rows[0]?.organization_id ?? null;
    },
  };
}
import { and, eq } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
