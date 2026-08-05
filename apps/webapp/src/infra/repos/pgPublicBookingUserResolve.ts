import { and, eq, isNull } from 'drizzle-orm';
import { getDrizzleOrMutationTx } from '@/infra/db/drizzleMutationTx';
import { syncUserIdentityFioMirrorWebapp } from '@/infra/repos/userIdentityFioSql';
import {
  drizzlePrimaryPhoneCol,
  syncUserContactsMirrorWebapp,
} from '@/infra/repos/userContactsSql';
import { platformUsers } from '../../../db/schema/schema';

/**
 * Resolve-or-create a client by normalised phone.
 *
 * `phoneProven` is REQUIRED and has no default on purpose (A-3). Before 2026-07-26 this function
 * stamped `patient_phone_trust_at` on every insert, so an unauthenticated POST to
 * `/api/booking/public/create` minted a phone-trusted identity — the same flag the login path
 * consults (`pgCanonicalPlatformUser.ts:118-127`). Trust is now a claim the caller has to have
 * earned, and the caller has to say so in the type system.
 *
 * @param phoneProven the caller has just proved control of THIS phone number (an SMS code it
 *   entered, or an authenticated session already bound to it). A code delivered to an e-mail does
 *   not qualify — see `channelProvesPhoneControl`.
 */
export async function resolveOrCreateTrustedPatientUserByPhone(
  phoneNormalized: string,
  displayName: string,
  phoneProven: boolean,
): Promise<{ userId: string | null; created: boolean }> {
  const db = getDrizzleOrMutationTx();
  const existing = await db
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(and(eq(drizzlePrimaryPhoneCol, phoneNormalized), isNull(platformUsers.mergedIntoId)))
    .limit(2);
  if (existing.length > 1) return { userId: null, created: false };
  if (existing[0]) return { userId: existing[0].id, created: false };

  const inserted = await db
    .insert(platformUsers)
    .values({
      phoneNormalized,
      displayName,
      role: 'client',
      patientPhoneTrustAt: phoneProven ? new Date().toISOString() : null,
    })
    .returning({ id: platformUsers.id });
  const userId = inserted[0]?.id ?? null;
  if (!userId) return { userId: null, created: false };

  await syncUserIdentityFioMirrorWebapp(db, userId);
  await syncUserContactsMirrorWebapp(db, userId);
  return { userId, created: true };
}
