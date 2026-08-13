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
import { sql } from 'drizzle-orm';
import { MergeConflictError } from './platformUserMergeErrors.js';
import {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
  enrichPickMergeCandidatesWithBookingCounts,
  type MergePlatformUsersReason,
  type PickMergeTargetCandidate,
  type PlatformMergeDbClient,
} from './pgPlatformUserMerge.js';
import { runMergeSql } from './mergeSql.js';
import { syncPlatformUserPhoneHistoryOnConfirm } from './phoneHistorySync.js';
import { syncUserContactsMirror } from './userContactsMirrorWrite.js';
import { syncUserIdentityFioMirror } from './userIdentityFioWrite.js';

/** Channels for which a fresh binding seeds opted-in broadcast defaults. */
const CHANNEL_PREFERENCES_SEED_CHANNELS = new Set(['telegram', 'max', 'sms']);

export type IdentityProjectionInput = {
  /** Legacy numeric anchor. New messenger identities are keyed only by channel binding. */
  integratorUserId?: string | null;
  phoneNormalized?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  channelCode?: string | null;
  externalId?: string | null;
  displayHandle?: string | null;
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

const CHANNEL_DISPLAY_HANDLE_MAX_LENGTH = 32;

function normalizeChannelDisplayHandle(value: string | null | undefined): string | null {
  const trimmed = trimmedOrNull(value)?.replace(/^@+/, '').trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, CHANNEL_DISPLAY_HANDLE_MAX_LENGTH);
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
  const r = await runMergeSql<IdentityMergeRow>(
    db,
    sql`SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, created_at
     FROM public.platform_users WHERE id = ${id}::uuid AND merged_into_id IS NULL`,
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
    integratorUserId?: string | null;
    phoneNormalized?: string | null;
    channelCode?: string | null;
    externalId?: string | null;
  },
): Promise<string[]> {
  const ids: string[] = [];

  let integratorMatched = false;
  let phoneMatched = false;
  let channelCandidateId: string | null = null;
  let channelCandidateIntegratorId: string | null = null;

  const integratorUserId = trimmedOrNull(params.integratorUserId);
  if (integratorUserId) {
    const byInt = await runMergeSql<{ id: string }>(
      db,
      sql`SELECT id::text AS id FROM public.platform_users
       WHERE integrator_user_id = ${integratorUserId}::bigint AND merged_into_id IS NULL
       LIMIT 3`,
    );
    if (byInt.rows.length > 1) {
      throw new MergeConflictError(
        'ambiguous integrator_user_id match',
        byInt.rows.map((r) => r.id),
      );
    }
    if (byInt.rows[0]) {
      integratorMatched = true;
      ids.push(byInt.rows[0].id);
    }
  }

  const phoneNormalized = trimmedOrNull(params.phoneNormalized);
  if (phoneNormalized) {
    const byPhone = await runMergeSql<{ id: string }>(
      db,
      sql`SELECT id::text AS id FROM public.platform_users
       WHERE phone_normalized = ${phoneNormalized} AND merged_into_id IS NULL
       LIMIT 3`,
    );
    if (byPhone.rows.length > 1) {
      throw new MergeConflictError(
        'ambiguous phone_normalized match',
        byPhone.rows.map((r) => r.id),
      );
    }
    if (byPhone.rows[0]) {
      phoneMatched = true;
      ids.push(byPhone.rows[0].id);
    }
  }

  const channelCode = trimmedOrNull(params.channelCode);
  const externalId = trimmedOrNull(params.externalId);
  if (channelCode && externalId) {
    const byChannel = await runMergeSql<{ user_id: string; integrator_user_id: string | null }>(
      db,
      sql`SELECT pu.id::text AS user_id, pu.integrator_user_id::text AS integrator_user_id
       FROM public.user_channel_bindings ucb
       INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
       WHERE ucb.channel_code = ${channelCode} AND ucb.external_id = ${externalId} AND pu.merged_into_id IS NULL
       LIMIT 1`,
    );
    if (byChannel.rows[0]) {
      channelCandidateId = byChannel.rows[0].user_id;
      channelCandidateIntegratorId = byChannel.rows[0].integrator_user_id;
      ids.push(byChannel.rows[0].user_id);
    }
  }

  if (
    !integratorMatched &&
    !phoneMatched &&
    channelCandidateId &&
    typeof channelCandidateIntegratorId === 'string' &&
    channelCandidateIntegratorId.length > 0 &&
    integratorUserId !== null &&
    channelCandidateIntegratorId !== integratorUserId
  ) {
    throw new MergeConflictError('channel_anchor_owned_by_other_user', [channelCandidateId]);
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
    integratorUserId?: string | null;
    phoneNormalized: string | null;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  },
): Promise<string> {
  const displayName = input.displayName ?? '';
  const integratorUserId = trimmedOrNull(input.integratorUserId);
  const res = await runMergeSql<{ id: string }>(
    db,
    sql`INSERT INTO public.platform_users (
       integrator_user_id, phone_normalized, display_name, first_name, last_name, email,
       patient_phone_trust_at
     )
     VALUES (
       ${integratorUserId}::bigint, ${input.phoneNormalized}, ${displayName}, ${input.firstName}, ${input.lastName}, ${input.email},
       CASE WHEN ${input.phoneNormalized}::text IS NOT NULL AND trim(${input.phoneNormalized}::text) <> '' THEN now() ELSE NULL END
     )
     RETURNING id::text AS id`,
  );
  const id = res.rows[0]?.id;
  if (!id) throw new MergeConflictError('insertIdentityProjection: insert returned no id', []);

  const phoneNormalized = input.phoneNormalized?.trim();
  if (phoneNormalized) {
    // D28: brand-new account created with an already-confirmed number — open its first active
    // `user_phone_history` spell (no prior row to close, unlike `enrichIdentityProjection`).
    await runMergeSql(
      db,
      sql`INSERT INTO public.user_phone_history (platform_user_id, phone_normalized, valid_from, valid_to, source)
       VALUES (${id}::uuid, ${phoneNormalized}::text, now(), NULL, 'projection')`,
    );
  }
  await syncUserIdentityFioMirror(db, id);
  // A name-only messenger event does not change the assembled contact index. Rebuilding all contact
  // sources here would make an unrelated profile refresh depend on the definer-only OAuth table.
  if (phoneNormalized || trimmedOrNull(input.email)) {
    await syncUserContactsMirror(db, id);
  }
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
    integratorUserId?: string | null;
    phoneNormalized: string | null;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    channelCode: string | null;
  },
): Promise<void> {
  const phoneNormalized = input.phoneNormalized?.trim();
  const integratorUserId = trimmedOrNull(input.integratorUserId);
  if (phoneNormalized) {
    // D28: this UPDATE below is about to (re)set `phone_normalized` for an EXISTING account — close
    // its previous active confirmation spell (if any, and if the number actually changed) before the
    // new number lands, so the old number stops appearing confirmed.
    await syncPlatformUserPhoneHistoryOnConfirm(db, platformUserId, phoneNormalized, 'projection');
  }
  const upd = await runMergeSql(
    db,
    sql`UPDATE public.platform_users SET
       display_name = CASE
         WHEN ${input.displayName}::text IS NOT NULL AND trim(${input.displayName}::text) <> ''
          AND ${input.firstName}::text IS NOT NULL AND trim(${input.firstName}::text) <> ''
          AND ${input.lastName}::text IS NOT NULL AND trim(${input.lastName}::text) <> ''
         THEN ${input.displayName}::text
         WHEN (display_name IS NULL OR trim(display_name) = '')
          AND ${input.displayName}::text IS NOT NULL AND trim(${input.displayName}::text) <> ''
         THEN ${input.displayName}::text
         ELSE display_name
       END,
       first_name = CASE
         WHEN ${input.channelCode}::text IN ('telegram', 'max') THEN COALESCE(first_name, ${input.firstName}::text)
         ELSE COALESCE(${input.firstName}::text, first_name)
       END,
       last_name = CASE
         WHEN ${input.channelCode}::text IN ('telegram', 'max') THEN COALESCE(last_name, ${input.lastName}::text)
         ELSE COALESCE(${input.lastName}::text, last_name)
       END,
       email = COALESCE(${input.email}::text, email),
       phone_normalized = COALESCE(${input.phoneNormalized}::text, phone_normalized),
       patient_phone_trust_at = CASE
         WHEN ${input.phoneNormalized}::text IS NOT NULL AND trim(${input.phoneNormalized}::text) <> '' THEN now()
         ELSE patient_phone_trust_at
       END,
       integrator_user_id = COALESCE(integrator_user_id, ${integratorUserId}::bigint),
       updated_at = now()
     WHERE id = ${platformUserId}::uuid AND merged_into_id IS NULL`,
  );
  if ((upd.rowCount ?? 0) < 1) {
    throw new MergeConflictError('enrichIdentityProjection: update matched no row', [
      platformUserId,
    ]);
  }
  await syncUserIdentityFioMirror(db, platformUserId);
  if (phoneNormalized || trimmedOrNull(input.email)) {
    await syncUserContactsMirror(db, platformUserId);
  }
}

/** Low-level channel-binding upsert — see {@link insertIdentityProjection} for why this is exported. */
export async function upsertChannelBindingForProjection(
  db: PlatformMergeDbClient,
  platformUserId: string,
  channelCode: string,
  externalId: string,
  displayHandle?: string | null,
): Promise<boolean> {
  const normalizedDisplayHandle = normalizeChannelDisplayHandle(displayHandle);
  const res = await runMergeSql<{ user_id: string }>(
    db,
    sql`INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id, display_handle)
     VALUES (${platformUserId}::uuid, ${channelCode}, ${externalId}, ${normalizedDisplayHandle})
     ON CONFLICT (channel_code, external_id) DO NOTHING
     RETURNING user_id::text AS user_id`,
  );
  const inserted = res.rows.length > 0;
  if (!inserted && normalizedDisplayHandle) {
    await runMergeSql(
      db,
      sql`UPDATE public.user_channel_bindings
       SET display_handle = ${normalizedDisplayHandle}
       WHERE user_id = ${platformUserId}::uuid
         AND channel_code = ${channelCode}
         AND external_id = ${externalId}
         AND display_handle IS DISTINCT FROM ${normalizedDisplayHandle}`,
    );
  }
  return inserted;
}

/** On a genuinely NEW `user_channel_bindings` row, seed `user_channel_preferences` opted-in. */
export async function seedChannelPreferencesDefaultsForProjection(
  db: PlatformMergeDbClient,
  platformUserId: string,
  channelCode: string,
  now: Date,
): Promise<void> {
  if (!CHANNEL_PREFERENCES_SEED_CHANNELS.has(channelCode)) return;
  await runMergeSql(
    db,
    sql`INSERT INTO public.user_channel_preferences AS preferences (
       user_id, platform_user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, updated_at
     )
     VALUES (${platformUserId}::text, ${platformUserId}::uuid, ${channelCode}, true, true, ${now})
     ON CONFLICT (user_id, channel_code) DO UPDATE SET
       platform_user_id = COALESCE(preferences.platform_user_id, EXCLUDED.platform_user_id),
       is_enabled_for_messages = true,
       is_enabled_for_notifications = true,
       updated_at = EXCLUDED.updated_at`,
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
  const displayHandle = normalizeChannelDisplayHandle(input.displayHandle);

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
      displayHandle,
    );
    if (channelBindingInserted) {
      await seedChannelPreferencesDefaultsForProjection(
        db,
        platformUserId,
        channelCode,
        new Date(),
      );
    }
  }

  return { platformUserId, channelBindingInserted };
}
