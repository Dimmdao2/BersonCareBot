/* eslint-disable no-secrets/no-secrets -- table tags, failure-code identifiers and JSDoc symbol names, not secrets */
/**
 * Track D — D1 SCAFFOLD (NOT wired into the live write path yet).
 *
 * One bounded integrator transaction that writes the channel anchor (integrator-only channel
 * identity, retained) PLUS the canonical webapp tables directly via qualified `public.*`:
 *   - `public.platform_users`          (canonical person; insert or enrich)
 *   - `public.user_channel_bindings`   (messenger identity → platform user)
 *   - `public.user_notification_topics`(per-topic notification preferences)
 *
 * This replaces the HTTP projection fanout (`user.upserted` / `preferences.updated` →
 * `tryEmitWebappProjectionThenEnqueue` → webapp `upsertFromProjection` / `upsertNotificationTopics`)
 * with a direct transactional write. The SQL mirrors the current webapp consumer
 * (`apps/webapp/src/infra/repos/pgUserProjection.ts`) so domain semantics are preserved.
 *
 * CHOKEPOINT: this repo accepts an injected `DbPort`; it never constructs a Pool, never checks out
 * a client, and never uses callback-form `.query`. All `public.*` writes run on the tx-bound `DbPort`
 * passed into `db.tx(...)`. Raw SQL is allowed here because this file is a `src/infra/db` repo (not a
 * guarded webapp app-layer file — see scripts/check-db-chokepoint.mjs).
 *
 * SERVER-AGENT TODOs are marked inline where exact schema columns / org resolution / merge wiring
 * must be confirmed against the live DB before this module is put on the live write path.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';

export type DirectPublicChannelCode = 'telegram' | 'max';

/**
 * D1 identity input. Shape matches the `user.upsert` mutation semantics in writePort.ts
 * (resource/externalId/username/firstName/lastName) plus optional notification topics.
 */
export type DirectPublicIdentityInput = {
  channelCode: DirectPublicChannelCode;
  externalId: string;
  phoneNormalized?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Notification preferences to upsert into `public.user_notification_topics` (optional). */
  topics?: ReadonlyArray<{ topicCode: string; isEnabled: boolean }>;
};

/** Result of the retained integrator-only channel anchor write. */
export type ChannelAnchorResult = {
  /** Canonical integrator user id (numeric text for telegram, identities.user_id for max). */
  integratorUserId: string;
};

export type WriteIdentityAndPreferencesDeps = {
  /**
   * Writes the integrator-only channel anchor / identity and returns the canonical integrator user id.
   *
   * D1 requires this to RETAIN integrator-only channel identity/state — it is NOT a duplicate business
   * projection. The server agent wires this to the existing repos inside the SAME tx:
   *   - telegram: `upsertUser(txDb, {...})` then `resolveCanonicalIntegratorUserId`
   *   - max:      `ensureIdentityForMessenger(txDb, {...})` then read `identities.user_id`
   * (see the `user.upsert` case in writePort.ts). Returns `null` when the anchor cannot be resolved
   * (e.g. non-numeric telegram id / missing identity) — the caller then aborts without any public write.
   */
  writeChannelAnchor(txDb: DbPort, input: DirectPublicIdentityInput): Promise<ChannelAnchorResult | null>;
  /**
   * Collapses duplicate canonical `public.platform_users` rows to a single id.
   * TODO(server-agent): wire to `mergePlatformUsersInTransaction` from `@bersoncare/platform-merge`
   * (same collapse the webapp `pgUserProjection.mergeCandidates` performs). The default rejects any
   * ambiguity so a partial scaffold can never silently pick a wrong canonical row.
   */
  mergeCandidateIds?: (txDb: DbPort, candidateIds: string[]) => Promise<string>;
};

export type WriteIdentityAndPreferencesResult = {
  integratorUserId: string;
  platformUserId: string;
  channelBindingInserted: boolean;
  topicsWritten: number;
};

export type DirectPublicWriteFailureCode =
  | 'channel_anchor_unresolved'
  | 'ambiguous_platform_user_candidates'
  | 'no_platform_user_candidate'
  | 'platform_user_write_failed';

export class DirectPublicWriteError extends Error {
  readonly code: DirectPublicWriteFailureCode;

  readonly candidateIds: string[];

  constructor(code: DirectPublicWriteFailureCode, options?: { candidateIds?: string[]; cause?: unknown }) {
    super(code);
    this.name = 'DirectPublicWriteError';
    this.code = code;
    this.candidateIds = options?.candidateIds ?? [];
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * A3 — concurrent-webhook idempotency: serialize all direct-public writes for the same canonical
 * integrator user id. Two webhooks racing for the same person (e.g. `user.upsert` + `notifications.update`
 * fired back-to-back, or duplicate delivery) must not interleave candidate-collection with another
 * transaction's insert/merge. Key idiom harvested from the retired `codex/direct-public-d1-987` branch's
 * SECURITY DEFINER function (`hashtextextended('<ns>:' || id, 0)`), reproduced here as plain TS/SQL.
 */
async function lockOnIntegratorUserId(txDb: DbPort, integratorUserId: string): Promise<void> {
  await txDb.query(`SELECT pg_advisory_xact_lock(hashtextextended('direct-public-identity:' || $1::text, 0))`, [
    integratorUserId,
  ]);
}

async function defaultMergeCandidateIds(_txDb: DbPort, candidateIds: string[]): Promise<string> {
  const uniq = [...new Set(candidateIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (uniq.length === 1) return uniq[0]!;
  if (uniq.length === 0) throw new DirectPublicWriteError('no_platform_user_candidate');
  // TODO(server-agent): replace with a real transactional merge before live wiring.
  throw new DirectPublicWriteError('ambiguous_platform_user_candidates', { candidateIds: uniq });
}

/**
 * Collect canonical `public.platform_users.id` candidates for this identity, mirroring
 * `pgUserProjection.collectCandidateIds`: by integrator_user_id, by phone, by channel binding.
 *
 * The channel-binding lookup runs ONLY when both `channelCode`/`externalId` are non-empty — this lets
 * `notifications.update`'s direct write match `pgUserProjection`'s `preferences.updated` handler exactly:
 * that consumer calls `upsertFromProjection({ integratorUserId })` with no channel args, so candidate
 * resolution there is integrator_user_id-only (see `writeNotificationTopicsDirect` below).
 */
export async function collectPlatformUserCandidates(
  txDb: DbPort,
  input: { integratorUserId: string; phoneNormalized: string | null; channelCode: string; externalId: string },
): Promise<string[]> {
  const ids: string[] = [];

  // TODO(server-agent): confirm `integrator_user_id` is BIGINT on live `public.platform_users`.
  const byInt = await txDb.query<{ id: string }>(
    `SELECT id::text AS id FROM public.platform_users
     WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL
     LIMIT 3`,
    [input.integratorUserId],
  );
  if (byInt.rows.length > 1) {
    throw new DirectPublicWriteError('ambiguous_platform_user_candidates', { candidateIds: byInt.rows.map((r) => r.id) });
  }
  if (byInt.rows[0]) ids.push(byInt.rows[0].id);

  if (input.phoneNormalized) {
    const byPhone = await txDb.query<{ id: string }>(
      `SELECT id::text AS id FROM public.platform_users
       WHERE phone_normalized = $1 AND merged_into_id IS NULL
       LIMIT 3`,
      [input.phoneNormalized],
    );
    if (byPhone.rows.length > 1) {
      throw new DirectPublicWriteError('ambiguous_platform_user_candidates', {
        candidateIds: byPhone.rows.map((r) => r.id),
      });
    }
    if (byPhone.rows[0]) ids.push(byPhone.rows[0].id);
  }

  if (input.channelCode && input.externalId) {
    const byChannel = await txDb.query<{ user_id: string }>(
      `SELECT pu.id::text AS user_id
       FROM public.user_channel_bindings ucb
       INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
       WHERE ucb.channel_code = $1 AND ucb.external_id = $2 AND pu.merged_into_id IS NULL
       LIMIT 1`,
      [input.channelCode, input.externalId],
    );
    if (byChannel.rows[0]) ids.push(byChannel.rows[0].user_id);
  }

  return [...new Set(ids)];
}

export async function insertPlatformUser(
  txDb: DbPort,
  input: { integratorUserId: string; phoneNormalized: string | null; displayName: string | null; firstName: string | null; lastName: string | null },
): Promise<string> {
  // TODO(server-agent): confirm the exact NOT NULL columns / defaults (display_name default '',
  // role default 'client', patient_phone_trust_at policy) on live `public.platform_users`.
  const res = await txDb.query<{ id: string }>(
    `INSERT INTO public.platform_users (
       integrator_user_id, phone_normalized, display_name, first_name, last_name, patient_phone_trust_at
     )
     VALUES (
       $1::bigint, $2, $3, $4, $5,
       CASE WHEN $2::text IS NOT NULL AND trim($2::text) <> '' THEN now() ELSE NULL END
     )
     RETURNING id::text AS id`,
    [
      input.integratorUserId,
      input.phoneNormalized,
      input.displayName ?? '',
      input.firstName,
      input.lastName,
    ],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new DirectPublicWriteError('platform_user_write_failed');
  return id;
}

export async function enrichPlatformUser(
  txDb: DbPort,
  platformUserId: string,
  input: { integratorUserId: string; phoneNormalized: string | null; displayName: string | null; firstName: string | null; lastName: string | null; channelCode: string },
): Promise<void> {
  // Enrich-only semantics mirror pgUserProjection: messenger names never overwrite existing names;
  // integrator_user_id / phone are backfilled via COALESCE; phone sets trust anchor.
  const upd = await txDb.query(
    `UPDATE public.platform_users SET
       display_name = CASE
         WHEN (display_name IS NULL OR trim(display_name) = '')
          AND $2::text IS NOT NULL AND trim($2::text) <> ''
         THEN $2::text
         ELSE display_name
       END,
       first_name = CASE
         WHEN $6::text IN ('telegram', 'max') THEN COALESCE(first_name, $3::text)
         ELSE COALESCE($3::text, first_name)
       END,
       last_name = CASE
         WHEN $6::text IN ('telegram', 'max') THEN COALESCE(last_name, $4::text)
         ELSE COALESCE($4::text, last_name)
       END,
       phone_normalized = COALESCE(phone_normalized, $5::text),
       patient_phone_trust_at = CASE
         WHEN $5::text IS NOT NULL AND trim($5::text) <> '' THEN now()
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
      input.phoneNormalized,
      input.channelCode,
      input.integratorUserId,
    ],
  );
  if ((upd.rowCount ?? 0) < 1) {
    throw new DirectPublicWriteError('platform_user_write_failed', { candidateIds: [platformUserId] });
  }
}

async function upsertChannelBinding(
  txDb: DbPort,
  platformUserId: string,
  channelCode: string,
  externalId: string,
): Promise<boolean> {
  const res = await txDb.query<{ user_id: string }>(
    `INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
     VALUES ($1::uuid, $2, $3)
     ON CONFLICT (channel_code, external_id) DO NOTHING
     RETURNING user_id::text AS user_id`,
    [platformUserId, channelCode, externalId],
  );
  return res.rows.length > 0;
}

export async function upsertNotificationTopics(
  txDb: DbPort,
  platformUserId: string,
  topics: ReadonlyArray<{ topicCode: string; isEnabled: boolean }>,
): Promise<number> {
  let written = 0;
  for (const topic of topics) {
    const code = trimmedOrNull(topic.topicCode);
    if (!code) continue;
    await txDb.query(
      `INSERT INTO public.user_notification_topics (user_id, topic_code, is_enabled)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (user_id, topic_code) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled, updated_at = now()`,
      [platformUserId, code, topic.isEnabled],
    );
    written += 1;
  }
  return written;
}

/**
 * D1 entrypoint: ONE bounded transaction writes the retained integrator channel anchor plus the
 * canonical `public.platform_users` / `user_channel_bindings` / `user_notification_topics`.
 *
 * Ordering inside the single tx:
 *   1. channel anchor (integrator-only identity, retained) → canonical integrator user id
 *   2. resolve/insert/enrich canonical `public.platform_users`
 *   3. upsert `public.user_channel_bindings`
 *   4. upsert `public.user_notification_topics`
 *
 * Any thrown error aborts the whole tx (single-transaction rollback): nothing is committed.
 */
export async function writeIdentityAndPreferencesDirect(
  db: DbPort,
  input: DirectPublicIdentityInput,
  deps: WriteIdentityAndPreferencesDeps,
): Promise<WriteIdentityAndPreferencesResult> {
  const mergeCandidateIds = deps.mergeCandidateIds ?? defaultMergeCandidateIds;
  const phoneNormalized = trimmedOrNull(input.phoneNormalized);
  const displayName = trimmedOrNull(input.displayName);
  const firstName = trimmedOrNull(input.firstName);
  const lastName = trimmedOrNull(input.lastName);
  const topics = input.topics ?? [];

  return db.tx(async (txDb) => {
    // 1) Retained integrator-only channel identity/anchor (NOT a duplicate business projection).
    const anchor = await deps.writeChannelAnchor(txDb, input);
    if (!anchor || !trimmedOrNull(anchor.integratorUserId)) {
      throw new DirectPublicWriteError('channel_anchor_unresolved');
    }
    const integratorUserId = anchor.integratorUserId.trim();

    // A3: serialize concurrent webhooks for the same person before any candidate read/write.
    await lockOnIntegratorUserId(txDb, integratorUserId);

    // 2) Canonical public.platform_users.
    const candidates = await collectPlatformUserCandidates(txDb, {
      integratorUserId,
      phoneNormalized,
      channelCode: input.channelCode,
      externalId: input.externalId,
    });

    let platformUserId: string;
    if (candidates.length === 0) {
      platformUserId = await insertPlatformUser(txDb, {
        integratorUserId,
        phoneNormalized,
        displayName,
        firstName,
        lastName,
      });
    } else {
      platformUserId = await mergeCandidateIds(txDb, candidates);
      await enrichPlatformUser(txDb, platformUserId, {
        integratorUserId,
        phoneNormalized,
        displayName,
        firstName,
        lastName,
        channelCode: input.channelCode,
      });
    }

    // 3) public.user_channel_bindings.
    const channelBindingInserted = await upsertChannelBinding(
      txDb,
      platformUserId,
      input.channelCode,
      input.externalId,
    );

    // 4) public.user_notification_topics.
    const topicsWritten = await upsertNotificationTopics(txDb, platformUserId, topics);

    return { integratorUserId, platformUserId, channelBindingInserted, topicsWritten };
  });
}

/** D1 identity input for the `notifications.update` direct write (see {@link writeNotificationTopicsDirect}). */
export type DirectNotificationTopicsInput = {
  /** Canonical integrator user id — caller resolves this the same way `user.upsert` does (channel anchor lookup + `resolveCanonicalIntegratorUserId`). */
  integratorUserId: string;
  topics: ReadonlyArray<{ topicCode: string; isEnabled: boolean }>;
};

export type WriteNotificationTopicsDeps = {
  /** Same contract/default as {@link WriteIdentityAndPreferencesDeps.mergeCandidateIds}. */
  mergeCandidateIds?: WriteIdentityAndPreferencesDeps['mergeCandidateIds'];
};

/**
 * D1 entrypoint for `notifications.update`: parity twin of the webapp `preferences.updated` handler,
 * which calls `pgUserProjection.upsertFromProjection({ integratorUserId })` (no channel/phone/name args)
 * to resolve-or-create the canonical `platform_users` row, then `upsertNotificationTopics`. No channel
 * anchor is written here (unlike `writeIdentityAndPreferencesDirect`) — the identity is assumed to already
 * exist by the time notification preferences are being changed (parity: the webapp consumer never writes
 * a channel binding for `preferences.updated` either).
 */
export async function writeNotificationTopicsDirect(
  db: DbPort,
  input: DirectNotificationTopicsInput,
  deps: WriteNotificationTopicsDeps = {},
): Promise<{ platformUserId: string; topicsWritten: number }> {
  const mergeCandidateIds = deps.mergeCandidateIds ?? defaultMergeCandidateIds;
  const integratorUserId = trimmedOrNull(input.integratorUserId);
  if (!integratorUserId) {
    throw new DirectPublicWriteError('channel_anchor_unresolved');
  }
  const topics = input.topics ?? [];

  return db.tx(async (txDb) => {
    await lockOnIntegratorUserId(txDb, integratorUserId);

    // Integrator_user_id-only candidate resolution — matches `preferences.updated`'s
    // `upsertFromProjection({ integratorUserId })` call (no channelCode/externalId/phone).
    const candidates = await collectPlatformUserCandidates(txDb, {
      integratorUserId,
      phoneNormalized: null,
      channelCode: '',
      externalId: '',
    });

    let platformUserId: string;
    if (candidates.length === 0) {
      platformUserId = await insertPlatformUser(txDb, {
        integratorUserId,
        phoneNormalized: null,
        displayName: null,
        firstName: null,
        lastName: null,
      });
    } else {
      platformUserId = await mergeCandidateIds(txDb, candidates);
      await enrichPlatformUser(txDb, platformUserId, {
        integratorUserId,
        phoneNormalized: null,
        displayName: null,
        firstName: null,
        lastName: null,
        channelCode: 'telegram',
      });
    }

    const topicsWritten = await upsertNotificationTopics(txDb, platformUserId, topics);
    return { platformUserId, topicsWritten };
  });
}
