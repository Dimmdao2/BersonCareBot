/**
 * Binding-first messenger phone: update webapp canon (`public.platform_users`) in the same DB/TX as integrator.
 * Uses qualified `public.*` names so behavior does not depend on connection `search_path`.
 */
import { sql } from 'drizzle-orm';
import { classifyMergeFailure } from './mergeFailureClassification.js';
import { mergeLogger as logger } from './mergeLogger.js';
import { runMergeSql } from './mergeSql.js';
import {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
  enrichPickMergeCandidatesWithBookingCounts,
  type PickMergeTargetCandidate,
  type PlatformMergeDbClient,
} from './pgPlatformUserMerge.js';
import { syncPlatformUserPhoneHistoryOnConfirm } from './phoneHistorySync.js';
import { mutateCanonicalUserContacts } from './userContactsMirrorWrite.js';

/** Any client with `.query` compatible with `pg` / integrator `DbPort` inside a transaction. */
export type MessengerPhoneBindDb = PlatformMergeDbClient;

export type MessengerPhoneLinkFailureCode =
  | 'no_channel_binding'
  | 'phone_owned_by_other_user'
  | 'channel_already_bound_to_other_user'
  | 'merge_blocked_booking_overlap'
  | 'merge_blocked_distinct_real_users'
  | 'merge_blocked_lfk_conflict'
  | 'merge_blocked_treatment_program_conflict'
  | 'merge_blocked_open_test_attempt_conflict'
  | 'merge_blocked_ambiguous_candidates'
  | 'legacy_contacts_conflict'
  | 'db_transient_failure';

export class MessengerPhoneLinkError extends Error {
  readonly code: MessengerPhoneLinkFailureCode;

  readonly candidateIds: string[];

  constructor(
    code: MessengerPhoneLinkFailureCode,
    options?: { cause?: unknown; candidateIds?: string[] },
  ) {
    super(code);
    this.name = 'MessengerPhoneLinkError';
    this.code = code;
    this.candidateIds = options?.candidateIds ?? [];
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

async function loadPickCandidate(
  db: MessengerPhoneBindDb,
  id: string,
): Promise<PickMergeTargetCandidate | null> {
  const r = await runMergeSql<{
    id: string;
    phone_normalized: string | null;
    created_at: Date | string;
  }>(
    db,
    sql`SELECT pu.id::text,
            (SELECT uc.value_normalized FROM public.user_contacts uc
             WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary = true LIMIT 1) AS phone_normalized,
            pu.created_at
     FROM public.platform_users pu
     WHERE pu.id = ${id}::uuid AND pu.merged_into_id IS NULL`,
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    phone_normalized: row.phone_normalized,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

async function findOtherPlatformUserWithSamePhone(
  db: MessengerPhoneBindDb,
  excludeId: string,
  phoneNormalized: string,
): Promise<string | null> {
  const fromContacts = await runMergeSql<{ id: string }>(
    db,
    sql`SELECT uc.platform_user_id::text AS id
     FROM public.user_contacts uc
     INNER JOIN public.platform_users pu ON pu.id = uc.platform_user_id
     WHERE uc.contact_kind = 'phone'
       AND uc.value_normalized = ${phoneNormalized}
       AND pu.merged_into_id IS NULL
       AND uc.platform_user_id <> ${excludeId}::uuid
     LIMIT 1`,
  );
  if (fromContacts.rows[0]?.id) return fromContacts.rows[0].id;

  return null;
}

function isUserContactsPhoneUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if (!('code' in err) || !('constraint' in err)) return false;
  return err.code === '23505' && err.constraint === 'uq_user_contacts_phone';
}

async function writeConfirmedPhoneAndMirror(
  db: MessengerPhoneBindDb,
  platformUserId: string,
  phoneNormalized: string,
): Promise<void> {
  await syncPlatformUserPhoneHistoryOnConfirm(db, platformUserId, phoneNormalized, 'messenger');
  await mutateCanonicalUserContacts(db as PlatformMergeDbClient, platformUserId, [{
    action: 'upsert', kind: 'phone', valueNormalized: phoneNormalized, isPrimary: true,
    confirmedAt: new Date().toISOString(), sourceOrigin: 'direct',
  }]);
}

async function resolveBoundPlatformUserId(
  db: MessengerPhoneBindDb,
  channelCode: string,
  externalId: string,
): Promise<string | null> {
  const r = await runMergeSql<{ platform_user_id: string }>(
    db,
    sql`SELECT pu.id::text AS platform_user_id
     FROM public.user_channel_bindings ucb
     INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.channel_code = ${channelCode} AND ucb.external_id = ${externalId}
       AND pu.merged_into_id IS NULL
     LIMIT 1`,
  );
  return r.rows[0]?.platform_user_id ?? null;
}

async function resolveCanonicalPlatformUserId(
  db: MessengerPhoneBindDb,
  platformUserId: string,
): Promise<string | null> {
  const r = await runMergeSql<{ id: string }>(
    db,
    sql`WITH RECURSIVE person_chain AS (
          SELECT id, merged_into_id
          FROM public.platform_users
          WHERE id = ${platformUserId}::uuid
          UNION
          SELECT next_person.id, next_person.merged_into_id
          FROM public.platform_users next_person
          INNER JOIN person_chain previous ON next_person.id = previous.merged_into_id
        )
        SELECT id::text
        FROM person_chain
        WHERE merged_into_id IS NULL
        LIMIT 1`,
  );
  return r.rows[0]?.id ?? null;
}

function mapMergeFailure(err: unknown, fallbackIds: string[]): MessengerPhoneLinkError {
  if (err instanceof MessengerPhoneLinkError) return err;
  const c = classifyMergeFailure(err, fallbackIds);
  return new MessengerPhoneLinkError(c.code as MessengerPhoneLinkFailureCode, {
    cause: err instanceof Error ? err : undefined,
    candidateIds: c.candidateIds,
  });
}

async function mergePairIfDistinct(
  db: MessengerPhoneBindDb,
  idA: string,
  idB: string,
  channelCode: string,
): Promise<void> {
  if (idA === idB) return;
  const mergeClient = db as PlatformMergeDbClient;
  const a = await loadPickCandidate(db, idA);
  const b = await loadPickCandidate(db, idB);
  if (!a || !b) {
    throw new MessengerPhoneLinkError('merge_blocked_ambiguous_candidates', {
      candidateIds: [idA, idB],
    });
  }
  const [ea, eb] = await enrichPickMergeCandidatesWithBookingCounts(mergeClient, a, b);
  const { target, duplicate } = pickMergeTargetId(ea, eb);
  await mergePlatformUsersInTransaction(mergeClient, target, duplicate, 'phone_bind', {
    mergeContext: { channel: channelCode },
  });
}

/**
 * Strict binding-first: row must exist in `user_channel_bindings` for (channelCode, externalId).
 * Resolves duplicate platform rows via full `mergePlatformUsersInTransaction`, then sets phone + trust.
 * After each intra-loop merge, re-resolves canonical `platformUserId`
 * via bindings so merge does not reuse a stale UUID that already became a merged-away alias (`merged_into_id` set).
 */
export async function applyMessengerPhonePublicBind(
  db: MessengerPhoneBindDb,
  input: {
    channelCode: string;
    externalId: string;
    phoneNormalized: string;
    preferredPlatformUserId?: string | null;
  },
): Promise<{ platformUserId: string }> {
  const { channelCode, externalId, phoneNormalized } = input;
  const preferredPlatformUserId = input.preferredPlatformUserId?.trim() || null;

  let platformUserId = await resolveBoundPlatformUserId(db, channelCode, externalId);
  if (!platformUserId) {
    throw new MessengerPhoneLinkError('no_channel_binding');
  }

  const mergeRoundMax = 8;
  const reboundFromChannel = async (): Promise<void> => {
    const next = await resolveBoundPlatformUserId(db, channelCode, externalId);
    if (next) platformUserId = next;
  };

  if (preferredPlatformUserId) {
    const preferredCanonicalId = await resolveCanonicalPlatformUserId(
      db,
      preferredPlatformUserId,
    );
    if (!preferredCanonicalId) {
      throw new MessengerPhoneLinkError('merge_blocked_ambiguous_candidates', {
        candidateIds: [platformUserId, preferredPlatformUserId],
      });
    }
    try {
      await mergePairIfDistinct(db, platformUserId, preferredCanonicalId, channelCode);
    } catch (err) {
      if (err instanceof MessengerPhoneLinkError) throw err;
      throw mapMergeFailure(err, [platformUserId, preferredCanonicalId]);
    }
    await reboundFromChannel();
  }

  for (let round = 0; round < mergeRoundMax; round++) {
    let changed = false;

    const otherPhone = await findOtherPlatformUserWithSamePhone(
      db,
      platformUserId,
      phoneNormalized,
    );
    if (otherPhone) {
      try {
        await mergePairIfDistinct(db, platformUserId, otherPhone, channelCode);
      } catch (err) {
        if (err instanceof MessengerPhoneLinkError) throw err;
        throw mapMergeFailure(err, [platformUserId, otherPhone]);
      }
      await reboundFromChannel();
      changed = true;
    }

    const rebound = await resolveBoundPlatformUserId(db, channelCode, externalId);
    if (rebound) platformUserId = rebound;

    if (!changed) break;
  }

  for (let writeAttempt = 0; writeAttempt < 2; writeAttempt++) {
    try {
      await writeConfirmedPhoneAndMirror(
        db,
        platformUserId,
        phoneNormalized,
      );
      return { platformUserId };
    } catch (err) {
      if (err instanceof MessengerPhoneLinkError) throw err;
      if (isUserContactsPhoneUniqueViolation(err)) {
        const otherPhone = await findOtherPlatformUserWithSamePhone(
          db,
          platformUserId,
          phoneNormalized,
        );
        if (!otherPhone) {
          throw new MessengerPhoneLinkError('phone_owned_by_other_user', {
            cause: err,
            candidateIds: [platformUserId],
          });
        }
        try {
          await mergePairIfDistinct(db, platformUserId, otherPhone, channelCode);
        } catch (mergeErr) {
          if (mergeErr instanceof MessengerPhoneLinkError) throw mergeErr;
          throw mapMergeFailure(mergeErr, [platformUserId, otherPhone]);
        }
        await reboundFromChannel();
        continue;
      }
      const pg = err as { code?: string };
      if (pg.code === '23505') {
        throw new MessengerPhoneLinkError('channel_already_bound_to_other_user', {
          cause: err,
          candidateIds: [platformUserId],
        });
      }
      logger.error({ err }, '[messengerPhone] public phone write or user_contacts mirror failed');
      throw new MessengerPhoneLinkError('db_transient_failure', { cause: err });
    }
  }

  throw new MessengerPhoneLinkError('db_transient_failure', { candidateIds: [platformUserId] });
}
