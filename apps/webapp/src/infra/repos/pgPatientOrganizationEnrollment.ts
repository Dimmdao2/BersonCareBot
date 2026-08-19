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
  // The rule itself no longer lives here. Since 2026-08-19 there are TWO creators of a client
  // relationship — this staff writer and the public-booking door — and a ceiling only one of them
  // passes is not a ceiling (measured: a widget booking took the 246th place on a tariff limited to
  // 1, after which this very route answered `patient_count_limit_reached`). Both now call the same
  // `app.assert_org_patient_count_quota_available`, which takes the same transaction-scoped
  // advisory lock the port used to take, so the check and the insert below stay atomic and the two
  // creators serialize against each other.
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
