/**
 * Binding-first messenger phone: update webapp canon (`public.platform_users`) in the same DB/TX as integrator.
 * Uses qualified `public.*` names so behavior does not depend on connection `search_path`.
 */
import { classifyMergeFailure } from "./mergeFailureClassification.js";
import { mergeLogger as logger } from "./mergeLogger.js";
import {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
  type PickMergeTargetCandidate,
  type PlatformMergeDbClient,
} from "./pgPlatformUserMerge.js";

/** Any client with `.query` compatible with `pg` / integrator `DbPort` inside a transaction. */
export type MessengerPhoneBindDb = PlatformMergeDbClient;

export type MessengerPhoneLinkFailureCode =
  | "no_channel_binding"
  | "phone_owned_by_other_user"
  | "integrator_id_mismatch"
  | "channel_already_bound_to_other_user"
  | "merge_blocked_booking_overlap"
  | "merge_blocked_distinct_real_users"
  | "merge_blocked_lfk_conflict"
  | "merge_blocked_ambiguous_candidates"
  | "legacy_contacts_conflict"
  | "merge_blocked_integrator_conflict"
  | "db_transient_failure";

export class MessengerPhoneLinkError extends Error {
  readonly code: MessengerPhoneLinkFailureCode;

  readonly candidateIds: string[];

  constructor(
    code: MessengerPhoneLinkFailureCode,
    options?: { cause?: unknown; candidateIds?: string[] },
  ) {
    super(code);
    this.name = "MessengerPhoneLinkError";
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
  const r = await db.query<{
    id: string;
    phone_normalized: string | null;
    integrator_user_id: string | null;
    created_at: Date | string;
  }>(
    `SELECT id::text,
            phone_normalized,
            integrator_user_id::text AS integrator_user_id,
            created_at
     FROM public.platform_users
     WHERE id = $1::uuid AND merged_into_id IS NULL`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    phone_normalized: row.phone_normalized,
    integrator_user_id: row.integrator_user_id,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

async function findOtherPlatformUserWithSamePhone(
  db: MessengerPhoneBindDb,
  excludeId: string,
  phoneNormalized: string,
): Promise<string | null> {
  const r = await db.query<{ id: string }>(
    `SELECT id::text FROM public.platform_users
     WHERE phone_normalized = $1 AND merged_into_id IS NULL AND id <> $2::uuid
     LIMIT 1`,
    [phoneNormalized, excludeId],
  );
  return r.rows[0]?.id ?? null;
}

async function findOtherPlatformUserWithSameIntegrator(
  db: MessengerPhoneBindDb,
  excludeId: string,
  integratorUserId: string,
): Promise<string | null> {
  const r = await db.query<{ id: string }>(
    `SELECT id::text FROM public.platform_users
     WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL AND id <> $2::uuid
     LIMIT 1`,
    [integratorUserId, excludeId],
  );
  return r.rows[0]?.id ?? null;
}

async function resolveBoundPlatformUserId(
  db: MessengerPhoneBindDb,
  channelCode: string,
  externalId: string,
): Promise<string | null> {
  const r = await db.query<{ platform_user_id: string }>(
    `SELECT pu.id::text AS platform_user_id
     FROM public.user_channel_bindings ucb
     INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.channel_code = $1 AND ucb.external_id = $2
       AND pu.merged_into_id IS NULL
     LIMIT 1`,
    [channelCode, externalId],
  );
  return r.rows[0]?.platform_user_id ?? null;
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
): Promise<void> {
  if (idA === idB) return;
  const mergeClient = db as PlatformMergeDbClient;
  const [a, b] = await Promise.all([loadPickCandidate(db, idA), loadPickCandidate(db, idB)]);
  if (!a || !b) {
    throw new MessengerPhoneLinkError("merge_blocked_ambiguous_candidates", {
      candidateIds: [idA, idB],
    });
  }
  const { target, duplicate } = pickMergeTargetId(a, b);
  await mergePlatformUsersInTransaction(mergeClient, target, duplicate, "phone_bind");
}

/**
 * Strict binding-first: row must exist in `user_channel_bindings` for (channelCode, externalId).
 * Resolves duplicate platform rows via full `mergePlatformUsersInTransaction`, then sets phone + trust + integrator_user_id.
 */
export async function applyMessengerPhonePublicBind(
  db: MessengerPhoneBindDb,
  input: {
    channelCode: string;
    externalId: string;
    phoneNormalized: string;
    canonicalIntegratorUserId: string;
  },
): Promise<{ platformUserId: string }> {
  const { channelCode, externalId, phoneNormalized, canonicalIntegratorUserId } = input;

  let platformUserId = await resolveBoundPlatformUserId(db, channelCode, externalId);
  if (!platformUserId) {
    throw new MessengerPhoneLinkError("no_channel_binding");
  }

  const mergeRoundMax = 8;
  for (let round = 0; round < mergeRoundMax; round++) {
    const rowMeta: {
      rows: Array<{ existing_int_uid: string | null }>;
      rowCount?: number;
    } = await db.query<{ existing_int_uid: string | null }>(
      `SELECT pu.integrator_user_id::text AS existing_int_uid
       FROM public.platform_users pu
       WHERE pu.id = $1::uuid AND pu.merged_into_id IS NULL`,
      [platformUserId],
    );
    const rawIntUid: string | null | undefined = rowMeta.rows[0]?.existing_int_uid;
    const existingInt: string | null =
      typeof rawIntUid === "string" && rawIntUid.trim() !== "" ? rawIntUid.trim() : null;

    if (existingInt && existingInt !== canonicalIntegratorUserId && existingInt !== "") {
      const canonPu: { rows: Array<{ id: string }>; rowCount?: number } = await db.query<{ id: string }>(
        `SELECT id::text FROM public.platform_users
         WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL
         LIMIT 1`,
        [canonicalIntegratorUserId],
      );
      const otherId: string | undefined = canonPu.rows[0]?.id;
      if (otherId && otherId !== platformUserId) {
        try {
          await mergePairIfDistinct(db, platformUserId, otherId);
        } catch (err) {
          if (err instanceof MessengerPhoneLinkError) throw err;
          throw mapMergeFailure(err, [platformUserId, otherId]);
        }
        const nextId = await resolveBoundPlatformUserId(db, channelCode, externalId);
        if (nextId) platformUserId = nextId;
        continue;
      }
      throw new MessengerPhoneLinkError("integrator_id_mismatch", {
        candidateIds: [platformUserId],
      });
    }

    let changed = false;

    const otherPhone = await findOtherPlatformUserWithSamePhone(db, platformUserId, phoneNormalized);
    if (otherPhone) {
      try {
        await mergePairIfDistinct(db, platformUserId, otherPhone);
      } catch (err) {
        if (err instanceof MessengerPhoneLinkError) throw err;
        throw mapMergeFailure(err, [platformUserId, otherPhone]);
      }
      changed = true;
    }

    const otherInt = await findOtherPlatformUserWithSameIntegrator(
      db,
      platformUserId,
      canonicalIntegratorUserId,
    );
    if (otherInt) {
      try {
        await mergePairIfDistinct(db, platformUserId, otherInt);
      } catch (err) {
        if (err instanceof MessengerPhoneLinkError) throw err;
        throw mapMergeFailure(err, [platformUserId, otherInt]);
      }
      changed = true;
    }

    const rebound = await resolveBoundPlatformUserId(db, channelCode, externalId);
    if (rebound) platformUserId = rebound;

    if (!changed) break;
  }

  try {
    const upd = await db.query(
      `UPDATE public.platform_users SET
         phone_normalized = $2,
         patient_phone_trust_at = now(),
         integrator_user_id = COALESCE(integrator_user_id, $3::bigint),
         updated_at = now()
       WHERE id = $1::uuid
         AND merged_into_id IS NULL`,
      [platformUserId, phoneNormalized, canonicalIntegratorUserId],
    );
    if ((upd.rowCount ?? 0) < 1) {
      throw new MessengerPhoneLinkError("db_transient_failure");
    }
  } catch (err) {
    if (err instanceof MessengerPhoneLinkError) throw err;
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      throw new MessengerPhoneLinkError("channel_already_bound_to_other_user", {
        cause: err,
        candidateIds: [platformUserId],
      });
    }
    logger.error({ err }, "[messengerPhone] public platform_users UPDATE failed");
    throw new MessengerPhoneLinkError("db_transient_failure", { cause: err });
  }

  return { platformUserId };
}
