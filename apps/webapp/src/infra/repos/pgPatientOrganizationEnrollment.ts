import { and, eq } from 'drizzle-orm';
import type { DrizzleDb } from '@/app-layer/db/drizzle';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import { orgEnrollments } from '../../../db/schema/bookingEngine';
import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';

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
  await transactionQuotaPort.withinLock(
    tx,
    { organizationId, mechanic: 'patient_count' },
    (quota) =>
      quota.assertStockAvailable(async () => {
        const usage = await runWebappPgText<{ used_value: number }>(
          `SELECT count(*)::int AS used_value
           FROM org_enrollments
           WHERE organization_id = $1
             AND status IN ('invited', 'active')`,
          [organizationId],
          tx,
        );
        return usage.rows[0]?.used_value ?? 0;
      }),
  );

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
