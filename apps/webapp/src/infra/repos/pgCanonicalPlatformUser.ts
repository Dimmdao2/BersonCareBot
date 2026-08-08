import { and, asc, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { drizzlePrimaryPhoneCol } from '@/infra/repos/userContactsSql';
import {
  platformUsers,
  userChannelBindings,
  userContacts,
  userIdentity,
} from '../../../db/schema/schema';

/** Max hops when following merged_into_id (cycle protection). */
export const MAX_MERGE_CHAIN_DEPTH = 5;

function pickUniqueCanonicalId(
  rows: { id: string }[],
  logMessage: string,
  logContext?: Record<string, unknown>,
): string | null {
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    console.error(logMessage, {
      count: rows.length,
      ids: rows.map((x) => x.id),
      ...logContext,
    });
    return null;
  }
  return rows[0]!.id;
}

/**
 * Follow merged_into_id chain to the canonical platform user id.
 * Returns `startId` if the row has no merge redirect or chain is broken.
 */
export async function followMergedIntoChain(
  db: WebappSqlExecutor,
  startId: string,
): Promise<string> {
  let current = startId;
  const seen = new Set<string>();
  for (let depth = 0; depth < MAX_MERGE_CHAIN_DEPTH; depth++) {
    if (seen.has(current)) {
      console.warn('[canonical] merged_into_id cycle detected at', current);
      return startId;
    }
    seen.add(current);
    const rows = await db
      .select({ mergedIntoId: platformUsers.mergedIntoId })
      .from(platformUsers)
      .where(eq(platformUsers.id, current))
      .limit(1);
    const next = rows[0]?.mergedIntoId ?? null;
    if (next == null) return current;
    current = next;
  }
  console.warn('[canonical] merged_into_id chain exceeded max depth from', startId);
  return current;
}

export type PlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
  display_name: string;
  role: string;
};

export async function selectPlatformUserById(
  db: WebappSqlExecutor,
  userId: string,
): Promise<PlatformUserRow | null> {
  const rows = await db
    .select({
      id: platformUsers.id,
      phone_normalized: drizzlePrimaryPhoneCol,
      integrator_user_id: sql<string | null>`${platformUsers.integratorUserId}::text`,
      merged_into_id: platformUsers.mergedIntoId,
      display_name: sql<string>`COALESCE(${userIdentity.displayName}, ${platformUsers.displayName})`,
      role: platformUsers.role,
    })
    .from(platformUsers)
    .leftJoin(userIdentity, eq(userIdentity.platformUserId, platformUsers.id))
    .where(eq(platformUsers.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Resolve to canonical id; returns null if user row missing. */
export async function resolveCanonicalUserId(
  db: WebappSqlExecutor,
  userId: string,
): Promise<string | null> {
  const row = await selectPlatformUserById(db, userId);
  if (!row) return null;
  if (!row.merged_into_id) return row.id;
  return followMergedIntoChain(db, row.merged_into_id);
}

/** Exactly one canonical row per phone; returns null if none; throws if multiple (data anomaly). */
export async function findCanonicalUserIdByPhone(
  db: WebappSqlExecutor,
  phoneNormalized: string,
): Promise<string | null> {
  const viaContacts = await db
    .select({ id: userContacts.platformUserId })
    .from(userContacts)
    .innerJoin(platformUsers, eq(platformUsers.id, userContacts.platformUserId))
    .where(
      and(
        eq(userContacts.contactKind, 'phone'),
        eq(userContacts.valueNormalized, phoneNormalized),
        isNull(platformUsers.mergedIntoId),
      ),
    )
    .orderBy(asc(platformUsers.createdAt))
    .limit(3);
  return pickUniqueCanonicalId(
    viaContacts,
    '[canonical] multiple canonical rows for phone via user_contacts (redacted)',
  );
}

/** Exactly one canonical row per integrator id. */
export async function findCanonicalUserIdByIntegratorId(
  db: WebappSqlExecutor,
  integratorUserId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(
      and(
        eq(sql`${platformUsers.integratorUserId}`, sql`${integratorUserId}::bigint`),
        isNull(platformUsers.mergedIntoId),
      ),
    )
    .orderBy(asc(platformUsers.createdAt))
    .limit(3);
  return pickUniqueCanonicalId(rows, '[canonical] multiple canonical rows for integrator_user_id', {
    integratorUserId,
  });
}

/**
 * Canonical user with this phone **and** trusted patient activation (`patient_phone_trust_at`).
 * Used for messenger entry resolution: do not link a channel to a canon by phone unless activation is trusted (§5).
 */
export async function findTrustedCanonicalUserIdByPhone(
  db: WebappSqlExecutor,
  phoneNormalized: string,
): Promise<string | null> {
  const viaContacts = await db
    .select({ id: userContacts.platformUserId })
    .from(userContacts)
    .innerJoin(platformUsers, eq(platformUsers.id, userContacts.platformUserId))
    .where(
      and(
        eq(userContacts.contactKind, 'phone'),
        eq(userContacts.isPrimary, true),
        eq(userContacts.valueNormalized, phoneNormalized),
        isNotNull(userContacts.confirmedAt),
        isNull(platformUsers.mergedIntoId),
      ),
    )
    .orderBy(asc(platformUsers.createdAt))
    .limit(3);
  return pickUniqueCanonicalId(
    viaContacts,
    '[canonical] multiple trusted canonical rows for phone via user_contacts (redacted)',
  );
}

export async function findCanonicalUserIdByChannelBinding(
  db: WebappSqlExecutor,
  channelCode: string,
  externalId: string,
): Promise<string | null> {
  // `user_channel_bindings` is the source of truth for messenger links: the integrator hot path
  // reads it directly, and the `user_contacts` copy of it was removed by migration 0382.
  const rows = await db
    .select({ user_id: userChannelBindings.userId })
    .from(userChannelBindings)
    .innerJoin(platformUsers, eq(platformUsers.id, userChannelBindings.userId))
    .where(
      and(
        eq(userChannelBindings.channelCode, channelCode),
        eq(userChannelBindings.externalId, externalId),
        isNull(platformUsers.mergedIntoId),
      ),
    )
    .limit(1);
  return rows[0]?.user_id ?? null;
}

export type CandidateIds = {
  byIntegrator: string | null;
  byPhone: string | null;
  byChannel: string | null;
};

/** Collect distinct canonical candidate ids from lookups (non-null only). */
export function distinctCanonicalCandidates(c: CandidateIds): string[] {
  const set = new Set<string>();
  if (c.byIntegrator) set.add(c.byIntegrator);
  if (c.byPhone) set.add(c.byPhone);
  if (c.byChannel) set.add(c.byChannel);
  return [...set];
}
