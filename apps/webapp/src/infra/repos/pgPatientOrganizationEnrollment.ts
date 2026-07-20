import { and, eq } from "drizzle-orm";
import type { DrizzleDb } from "@/app-layer/db/drizzle";
import { orgEnrollments } from "../../../db/schema/bookingEngine";

export type SchedulableClientEnrollmentStatus = "invited" | "active";

export class OrganizationClientRelationshipDeniedError extends Error {
  constructor() {
    super("patient_not_available");
  }
}

/**
 * Staff card relationship writer. It never proves portal identity: new relationships are invited,
 * while an already-active relationship stays active and discharged/archived rows stay denied.
 */
export async function ensureInvitedOrganizationClientRelationship(
  tx: DrizzleDb,
  organizationId: string,
  platformUserId: string,
): Promise<SchedulableClientEnrollmentStatus> {
  const findRelationship = async () => {
    const [row] = await tx
      .select({ status: orgEnrollments.status })
      .from(orgEnrollments)
      .where(
        and(
          eq(orgEnrollments.organizationId, organizationId),
          eq(orgEnrollments.platformUserId, platformUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  };

  const existing = await findRelationship();
  if (existing) {
    if (existing.status === "invited" || existing.status === "active") return existing.status;
    throw new OrganizationClientRelationshipDeniedError();
  }

  await tx
    .insert(orgEnrollments)
    .values({ organizationId, platformUserId, status: "invited" })
    .onConflictDoNothing({
      target: [orgEnrollments.organizationId, orgEnrollments.platformUserId],
    });

  const converged = await findRelationship();
  if (converged?.status === "invited" || converged?.status === "active") {
    return converged.status;
  }
  throw new OrganizationClientRelationshipDeniedError();
}
