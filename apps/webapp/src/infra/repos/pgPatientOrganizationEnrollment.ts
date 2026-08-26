import { and, eq } from 'drizzle-orm';
import type { DrizzleDb } from '@/app-layer/db/drizzle';
import { orgEnrollments } from '../../../db/schema/bookingEngine';
import { platformUsers } from '../../../db/schema/schema';

export type SchedulableClientEnrollmentStatus = 'invited' | 'active';

export class OrganizationClientRelationshipDeniedError extends Error {
  constructor() {
    super('patient_not_available');
  }
}

/**
 * Staff card relationship writer. It never proves portal identity: new relationships are invited,
 * while an already-active relationship stays active and discharged/archived rows stay denied.
 * A globally blocked patient cannot be scheduled, regardless of the clinic relationship state.
 */
export async function ensureInvitedOrganizationClientRelationship(
  tx: DrizzleDb,
  organizationId: string,
  platformUserId: string,
  options?: { reactivateArchived?: boolean },
): Promise<SchedulableClientEnrollmentStatus> {
  const [patient] = await tx
    .select({ role: platformUsers.role, isBlocked: platformUsers.isBlocked })
    .from(platformUsers)
    .where(eq(platformUsers.id, platformUserId))
    .limit(1);
  if (!patient || patient.role !== 'client' || patient.isBlocked) {
    throw new OrganizationClientRelationshipDeniedError();
  }

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
    if (existing.status === 'invited' || existing.status === 'active') return existing.status;
    if (existing.status === 'archived' && options?.reactivateArchived === true) {
      await tx
        .update(orgEnrollments)
        .set({ status: 'active' })
        .where(
          and(
            eq(orgEnrollments.organizationId, organizationId),
            eq(orgEnrollments.platformUserId, platformUserId),
            eq(orgEnrollments.status, 'archived'),
          ),
        );
      const reactivated = await findRelationship();
      if (reactivated?.status === 'active') return 'active';
    }
    throw new OrganizationClientRelationshipDeniedError();
  }

  // Т12 (owner 19.08, дословно): «лимит клиентов - убрать». A new relationship used to pass an
  // atomic `patient_count` ceiling here first; the clinic is billed for seats, not for people in
  // its base, so a new card now goes straight in with no counting and no quota lock at all.
  await tx
    .insert(orgEnrollments)
    .values({ organizationId, platformUserId, status: 'invited' })
    .onConflictDoNothing({
      target: [orgEnrollments.organizationId, orgEnrollments.platformUserId],
    });

  const converged = await findRelationship();
  if (converged?.status === 'invited' || converged?.status === 'active') {
    return converged.status;
  }
  throw new OrganizationClientRelationshipDeniedError();
}
