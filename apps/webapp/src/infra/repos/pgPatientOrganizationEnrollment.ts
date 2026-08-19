import { and, eq } from 'drizzle-orm';
import type { DrizzleDb } from '@/app-layer/db/drizzle';
import { orgEnrollments } from '../../../db/schema/bookingEngine';
import { assertOrgPatientCountQuotaAvailable } from '@/infra/repos/transactionQuotaPort';

export type SchedulableClientEnrollmentStatus = 'invited' | 'active';

export class OrganizationClientRelationshipDeniedError extends Error {
  constructor() {
    super('patient_not_available');
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
    if (existing.status === 'invited' || existing.status === 'active') return existing.status;
    throw new OrganizationClientRelationshipDeniedError();
  }

  // §5a stage 5.2: the atomic patient_count check runs only for a genuinely new relationship —
  // an existing (invited/active) card above never re-enters here, so editing a patient's card is
  // never blocked by this quota. Archiving/discharging a patient removes its row from this count
  // (see `SchedulableClientEnrollmentStatus`), freeing the slot for a new one.
  //
  // The rule itself no longer lives here — it lives in `app.assert_org_patient_count_quota_available`,
  // which takes the same transaction-scoped advisory lock the port used to take, so the check and the
  // insert below stay atomic. This IS the only caller (owner 19.08, `OWNER_PRODUCT_RULES.md` §33.2):
  // there are two creators of a client relationship — this staff writer and the public-booking door
  // (`app.enroll_current_patient_in_public_booking_clinic`) — but only a staff-opened card spends the
  // clinic's paid place. A public visitor's own booking does not, by owner ruling; migration 0053
  // removed the door's call after 0052 had briefly added it for symmetry and, with it, refused
  // visitors for a reason that was never theirs to bear.
  await assertOrgPatientCountQuotaAvailable(tx, organizationId);

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
