/**
 * Single shared implementation of "resolve-or-create the canonical `platform_users` row for an
 * incoming channel/OAuth identity, then bind the channel" (D15b/2). Both apps' `user.upsert`-class
 * write paths call this — integrator's channel webhooks and webapp's own projection consumer — so
 * there is exactly one place that assembles a person from integrator id / phone / channel binding,
 * not two parallel copies of the same SQL.
 *
 * Also carries the candidate-collapse cascade (`collapseIdentityProjectionCandidates`), previously
 * duplicated as `pgUserProjection.mergeCandidates` (webapp) and `mergeCandidatesDirect.mergeCandidateIdsViaPlatformMerge`
 * (integrator) — both already called the same `mergePlatformUsersInTransaction` primitive below.
 */
import { MergeConflictError } from './platformUserMergeErrors.js';
import {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
  enrichPickMergeCandidatesWithBookingCounts,
  type MergePlatformUsersReason,
  type PickMergeTargetCandidate,
  type PlatformMergeDbClient,
} from './pgPlatformUserMerge.js';
import { syncPlatformUserPhoneHistoryOnConfirm } from './phoneHistorySync.js';
import { syncUserIdentityFioMirror } from './userIdentityFioWrite.js';

/** Channels for which a fresh binding seeds opted-in broadcast defaults. */
const CHANNEL_PREFERENCES_SEED_CHANNELS = new Set(['telegram', 'max', 'sms']);

export type IdentityProjectionInput = {
  integratorUserId: string;
  phoneNormalized?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  channelCode?: string | null;
  externalId?: string | null;
};

export type IdentityProjectionResult = {
  platformUserId: string;
  channelBindingInserted: boolean;
};

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

type IdentityMergeRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  created_at: Date | string;
};

async function loadCandidateForMerge(
  db: PlatformMergeDbClient,
  id: string,
): Promise<PickMergeTargetCandidate | null> {
  const r = await db.query<IdentityMergeRow>(
    `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, created_at
     FROM platform_users WHERE id = $1::uuid AND merged_into_id IS NULL`,
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

/**
 * Collapse candidate `platform_users.id`s to one canonical id via the shared merge engine.
 * Requires >=1 candidate; a single candidate is returned as-is without touching the DB.
 */
export async function collapseIdentityProjectionCandidates(
  db: PlatformMergeDbClient,
  candidateIds: string[],
  reason: MergePlatformUsersReason,
): Promise<string> {
  const uniq = [
    ...new Set(candidateIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (uniq.length === 0) {
    throw new MergeConflictError('collapseIdentityProjectionCandidates: empty', []);
  }
  let ids = [...uniq].sort();
  while (ids.length > 1) {
    const id0 = ids[0]!;
    const id1 = ids[1]!;
    const a = await loadCandidateForMerge(db, id0);
    const b = await loadCandidateForMerge(db, id1);
    if (!a || !b) {
      throw new MergeConflictError('collapseIdentityProjectionCandidates: row missing', ids);
    }
    const [ea, eb] = await enrichPickMergeCandidatesWithBookingCounts(db, a, b);
    const { target, duplicate } = pickMergeTargetId(ea, eb);
    await mergePlatformUsersInTransaction(db, target, duplicate, reason);
    ids = ids.filter((x) => x !== duplicate);
  }
  return ids[0]!;
}

/**
 * Candidate `platform_users.id` lookup by integrator id / phone / channel binding — the read side of
 * identity resolution for an incoming channel/OAuth identity.
 */
export async function collectIdentityProjectionCandidates(
  db: PlatformMergeDbClient,
  params: {
    integratorUserId: string;
    phoneNormalized?: string | null;
    channelCode?: string | null;
    externalId?: string | null;
  },
): Promise<string[]> {
  const ids: string[] = [];

  const byInt = await db.query<{ id: string }>(
    `SELECT id::text AS id FROM platform_users
     WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL
     LIMIT 3`,
    [params.integratorUserId],
  );
  if (byInt.rows.length > 1) {
    throw new MergeConflictError(
      'ambiguous integrator_user_id match',
      byInt.rows.map((r) => r.id),
    );
  }
  if (byInt.rows[0]) ids.push(byInt.rows[0].id);

  const phoneNormalized = trimmedOrNull(params.phoneNormalized);
  if (phoneNormalized) {
    const byPhone = await db.query<{ id: string }>(
      `SELECT id::text AS id FROM platform_users
       WHERE phone_normalized = $1 AND merged_into_id IS NULL
       LIMIT 3`,
      [phoneNormalized],
    );
    if (byPhone.rows.length > 1) {
      throw new MergeConflictError(
        'ambiguous phone_normalized match',
        byPhone.rows.map((r) => r.id),
      );
    }
    if (byPhone.rows[0]) ids.push(byPhone.rows[0].id);
  }

  const channelCode = trimmedOrNull(params.channelCode);
  const externalId = trimmedOrNull(params.externalId);
  if (channelCode && externalId) {
    const byChannel = await db.query<{ user_id: string }>(
      `SELECT pu.id::text AS user_id
       FROM user_channel_bindings ucb
       INNER JOIN platform_users pu ON pu.id = ucb.user_id
       WHERE ucb.channel_code = $1 AND ucb.external_id = $2 AND pu.merged_into_id IS NULL
       LIMIT 1`,
      [channelCode, externalId],
    );
    if (byChannel.rows[0]) ids.push(byChannel.rows[0].user_id);
  }

  return [...new Set(ids)];
}

/**
 * Low-level insert step (no candidate collection/collapse) — exposed for callers that own their own
 * candidate-collapse policy (e.g. the integrator's `mergeCandidateIds` dependency injection, kept
 * swappable for tests that must NOT invoke the real merge engine).
 */
export async function insertIdentityProjection(
  db: PlatformMergeDbClient,
  input: {
    integratorUserId: string;
    phoneNormalized: string | null;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  },
): Promise<string> {
  const displayName = input.displayName ?? '';
  const res = await db.query<{ id: string }>(
    `INSERT INTO platform_users (
       integrator_user_id, phone_normalized, display_name, first_name, last_name, email,
       patient_phone_trust_at
     )
     VALUES (
       $1::bigint, $2, $3, $4, $5, $6,
       CASE WHEN $2::text IS NOT NULL AND trim($2::text) <> '' THEN now() ELSE NULL END
     )
     RETURNING id::text AS id`,
    [
      input.integratorUserId,
      input.phoneNormalized,
      displayName,
      input.firstName,
      input.lastName,
      input.email,
    ],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new MergeConflictError('insertIdentityProjection: insert returned no id', []);

  const phoneNormalized = input.phoneNormalized?.trim();
  if (phoneNormalized) {
    // D28: brand-new account created with an already-confirmed number — open its first active
    // `user_phone_history` spell (no prior row to close, unlike `enrichIdentityProjection`).
    await db.query(
      `INSERT INTO user_phone_history (platform_user_id, phone_normalized, valid_from, valid_to, source)
       VALUES ($1::uuid, $2::text, now(), NULL, 'projection')`,
      [id, phoneNormalized],
    );
  }
  await syncUserIdentityFioMirror(db, id);
  return id;
}

/**
 * Enrich semantics (byte parity kept from the two prior copies): `display_name` is overwritten
 * when displayName+firstName+lastName are ALL non-empty (structured triple wins); otherwise it
 * only fills a currently-empty `display_name`. `first_name`/`last_name` prefer the EXISTING value
 * for messenger channels (a human correction in the app must not be clobbered by a stale Telegram/MAX
 * profile name), and prefer the NEW value for any other channel (e.g. OAuth). `email`/`phone_normalized`
 * are backfilled; a non-empty phone (re)sets the trust anchor unconditionally (channel already vouched
 * for the number — see `IDENTITY_AND_MERGE_SCHEME.md` §1).
 */
/** Low-level enrich step — see {@link insertIdentityProjection} for why this is exported. */
export async function enrichIdentityProjection(
  db: PlatformMergeDbClient,
  platformUserId: string,
  input: {
    integratorUserId: string;
    phoneNormalized: string | null;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    channelCode: string | null;
  },
): Promise<void> {
  const phoneNormalized = input.phoneNormalized?.trim();
  if (phoneNormalized) {
    // D28: this UPDATE below is about to (re)set `phone_normalized` for an EXISTING account — close
    // its previous active confirmation spell (if any, and if the number actually changed) before the
    // new number lands, so the old number stops appearing confirmed.
    await syncPlatformUserPhoneHistoryOnConfirm(db, platformUserId, phoneNormalized, 'projection');
  }
  const upd = await db.query(
    `UPDATE platform_users SET
       display_name = CASE
         WHEN $2::text IS NOT NULL AND trim($2::text) <> ''
          AND $3::text IS NOT NULL AND trim($3::text) <> ''
          AND $4::text IS NOT NULL AND trim($4::text) <> ''
         THEN $2::text
         WHEN (display_name IS NULL OR trim(display_name) = '')
          AND $2::text IS NOT NULL AND trim($2::text) <> ''
         THEN $2::text
         ELSE display_name
       END,
       first_name = CASE
         WHEN $8::text IN ('telegram', 'max') THEN COALESCE(first_name, $3::text)
         ELSE COALESCE($3::text, first_name)
       END,
       last_name = CASE
         WHEN $8::text IN ('telegram', 'max') THEN COALESCE(last_name, $4::text)
         ELSE COALESCE($4::text, last_name)
       END,
       email = COALESCE($5::text, email),
       phone_normalized = COALESCE($6::text, phone_normalized),
       patient_phone_trust_at = CASE
         WHEN $6::text IS NOT NULL AND trim($6::text) <> '' THEN now()
         ELSE patient_phone_trust_at
       END,
       integrator_user_id = COALESCE(integrator_user_id, $7::bigint),
       updated_at = now()
     WHERE id = $1::uuid AND merged_into_id IS NULL`,
    [
      platformUserId,
      input.displayName,
      input.firstName,
      input.lastName,
      input.email,
      input.phoneNormalized,
      input.integratorUserId,
      input.channelCode,
    ],
  );
  if ((upd.rowCount ?? 0) < 1) {
    throw new MergeConflictError('enrichIdentityProjection: update matched no row', [
      platformUserId,
    ]);
  }
  await syncUserIdentityFioMirror(db, platformUserId);
}

/** Low-level channel-binding upsert — see {@link insertIdentityProjection} for why this is exported. */
export async function upsertChannelBindingForProjection(
  db: PlatformMergeDbClient,
  platformUserId: string,
  channelCode: string,
  externalId: string,
): Promise<boolean> {
  const res = await db.query<{ user_id: string }>(
    `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
     VALUES ($1::uuid, $2, $3)
     ON CONFLICT (channel_code, external_id) DO NOTHING
     RETURNING user_id::text AS user_id`,
    [platformUserId, channelCode, externalId],
  );
  return res.rows.length > 0;
}

/** On a genuinely NEW `user_channel_bindings` row, seed `user_channel_preferences` opted-in. */
export async function seedChannelPreferencesDefaultsForProjection(
  db: PlatformMergeDbClient,
  platformUserId: string,
  channelCode: string,
  now: Date,
): Promise<void> {
  if (!CHANNEL_PREFERENCES_SEED_CHANNELS.has(channelCode)) return;
  await db.query(
    `INSERT INTO user_channel_preferences (
       user_id, platform_user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, updated_at
     )
     VALUES ($1::text, $1::uuid, $2, true, true, $3)
     ON CONFLICT (user_id, channel_code) DO UPDATE SET
       platform_user_id = COALESCE(user_channel_preferences.platform_user_id, EXCLUDED.platform_user_id),
       is_enabled_for_messages = true,
       is_enabled_for_notifications = true,
       updated_at = EXCLUDED.updated_at`,
    [platformUserId, channelCode, now],
  );
}

/**
 * Resolve-or-create the canonical `platform_users` row for an incoming identity, then bind the
 * channel (if given). Caller owns the transaction boundary and any concurrency lock; this function
 * runs its statements on whatever `PlatformMergeDbClient` it is given (webapp: pool-tx `PoolClient`,
 * integrator: tx-bound `DbPort`).
 */
export async function upsertIdentityProjection(
  db: PlatformMergeDbClient,
  input: IdentityProjectionInput,
  options: { mergeReason: MergePlatformUsersReason } = { mergeReason: 'projection' },
): Promise<IdentityProjectionResult> {
  const phoneNormalized = trimmedOrNull(input.phoneNormalized);
  const displayName = trimmedOrNull(input.displayName);
  const firstName = trimmedOrNull(input.firstName);
  const lastName = trimmedOrNull(input.lastName);
  const email = trimmedOrNull(input.email);
  const channelCode = trimmedOrNull(input.channelCode);
  const externalId = trimmedOrNull(input.externalId);

  const candidates = await collectIdentityProjectionCandidates(db, {
    integratorUserId: input.integratorUserId,
    phoneNormalized,
    channelCode,
    externalId,
  });

  let platformUserId: string;
  if (candidates.length === 0) {
    platformUserId = await insertIdentityProjection(db, {
      integratorUserId: input.integratorUserId,
      phoneNormalized,
      displayName,
      firstName,
      lastName,
      email,
    });
  } else {
    platformUserId =
      candidates.length === 1
        ? candidates[0]!
        : await collapseIdentityProjectionCandidates(db, candidates, options.mergeReason);
    await enrichIdentityProjection(db, platformUserId, {
      integratorUserId: input.integratorUserId,
      phoneNormalized,
      displayName,
      firstName,
      lastName,
      email,
      channelCode,
    });
  }

  let channelBindingInserted = false;
  if (channelCode && externalId) {
    channelBindingInserted = await upsertChannelBindingForProjection(
      db,
      platformUserId,
      channelCode,
      externalId,
    );
    if (channelBindingInserted) {
      await seedChannelPreferencesDefaultsForProjection(db, platformUserId, channelCode, new Date());
    }
  }

  return { platformUserId, channelBindingInserted };
}
