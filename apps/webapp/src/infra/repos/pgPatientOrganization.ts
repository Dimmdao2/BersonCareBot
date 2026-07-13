import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  PatientOrganizationEnrollment,
  PatientOrganizationPort,
} from "@/modules/patient-organization/ports";
import { orgEnrollments } from "../../../db/schema/bookingEngine";

type OrgEnrollmentRow = typeof orgEnrollments.$inferSelect;

function mapOrgEnrollment(row: OrgEnrollmentRow): PatientOrganizationEnrollment {
  return {
    organizationId: row.organizationId,
    platformUserId: row.platformUserId,
    status: row.status as PatientOrganizationEnrollment["status"],
    createdAt: row.createdAt,
  };
}

export function createPgPatientOrganizationPort(): PatientOrganizationPort {
  return {
    async listActiveEnrollmentsByPlatformUser(platformUserId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(orgEnrollments)
        .where(
          and(
            eq(orgEnrollments.platformUserId, platformUserId),
            eq(orgEnrollments.status, "active"),
          ),
        )
        .orderBy(asc(orgEnrollments.createdAt), asc(orgEnrollments.organizationId));
      return rows.map(mapOrgEnrollment);
    },
  };
}
