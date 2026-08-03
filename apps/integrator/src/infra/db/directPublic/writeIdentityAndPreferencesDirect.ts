/**
 * D15b/2 — live write path for `user.upsert` (Telegram/MAX webhooks).
 *
 * One bounded integrator transaction that writes the channel anchor (integrator-only channel
 * identity, retained) PLUS the canonical webapp tables directly via qualified `public.*`:
 *   - `public.platform_users`          (canonical person; insert or enrich)
 *   - `public.user_channel_bindings`   (messenger identity → platform user)
 *
 * The actual `platform_users`/`user_channel_bindings` write is the shared
 * `@bersoncare/platform-merge` `identityProjectionWrite` implementation — the SAME code the webapp's
 * `pgUserProjection.ts` calls on its own pool transaction. This file owns only what is genuinely
 * integrator-specific: the retained channel anchor, the cross-webhook advisory lock, and the
 * candidate-collapse dependency-injection seam kept for tests that must not invoke the real merge
 * engine (see `WriteIdentityAndPreferencesDeps.mergeCandidateIds`).
 *
 * CHOKEPOINT: this repo accepts an injected `DbPort`; it never constructs a Pool, never checks out
 * a client, and never uses callback-form `.query`. All `public.*` writes run on the tx-bound `DbPort`
 * passed into `db.tx(...)`. Raw SQL is allowed here because this file is a `src/infra/db` repo (not a
 * guarded webapp app-layer file).
 */
import { sql } from 'drizzle-orm';
import {
  enrichIdentityProjection,
  insertIdentityProjection,
  seedChannelPreferencesDefaultsForProjection,
  upsertChannelBindingForProjection,
  collectIdentityProjectionCandidates as collectIdentityProjectionCandidatesShared,
  MergeConflictError,
  type PlatformMergeDbClient,
} from '@bersoncare/platform-merge';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

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
  writeChannelAnchor(
    txDb: DbPort,
    input: DirectPublicIdentityInput,
  ): Promise<ChannelAnchorResult | null>;
  /**
   * Collapses duplicate canonical `public.platform_users` rows to a single id.
   * Production wires this to `mergeCandidateIdsViaPlatformMerge` (`@bersoncare/platform-merge`'s
   * real merge engine, same as the webapp `pgUserProjection.mergeCandidates` uses). The default
   * rejects any ambiguity so a caller that does not inject real merge capability (e.g. a unit test)
   * can never silently pick a wrong canonical row.
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

  constructor(
    code: DirectPublicWriteFailureCode,
    options?: { candidateIds?: string[]; cause?: unknown },
  ) {
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
  await runIntegratorSql(
    txDb,
    sql`SELECT pg_advisory_xact_lock(hashtextextended('direct-public-identity:' || ${integratorUserId}::text, 0))`,
  );
}

async function defaultMergeCandidateIds(_txDb: DbPort, candidateIds: string[]): Promise<string> {
  const uniq = [
    ...new Set(candidateIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (uniq.length === 1) return uniq[0]!;
  if (uniq.length === 0) throw new DirectPublicWriteError('no_platform_user_candidate');
  throw new DirectPublicWriteError('ambiguous_platform_user_candidates', { candidateIds: uniq });
}

/**
 * Collect canonical `public.platform_users.id` candidates for this identity — thin wrapper over the
 * shared `@bersoncare/platform-merge` implementation (also used by the webapp), preserving this
 * module's own `DirectPublicWriteError` contract for callers that catch it directly
 * (`resolveDirectPublicActor.ts`, `writeReminderRulesDirect.ts`).
 *
 * The channel-binding lookup runs ONLY when both `channelCode`/`externalId` are non-empty — this lets
 * `notifications.update`'s direct write match `pgUserProjection`'s `preferences.updated` handler exactly:
 * that consumer calls `upsertFromProjection({ integratorUserId })` with no channel args, so candidate
 * resolution there is integrator_user_id-only.
 */
export async function collectPlatformUserCandidates(
  txDb: DbPort,
  input: {
    integratorUserId: string;
    phoneNormalized: string | null;
    channelCode: string;
    externalId: string;
  },
): Promise<string[]> {
  try {
    return await collectIdentityProjectionCandidatesShared(txDb as PlatformMergeDbClient, input);
  } catch (err) {
    if (err instanceof MergeConflictError) {
      throw new DirectPublicWriteError('ambiguous_platform_user_candidates', {
        candidateIds: err.candidateIds,
      });
    }
    throw err;
  }
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
    await runIntegratorSql(
      txDb,
      sql`INSERT INTO public.user_notification_topics (user_id, topic_code, is_enabled)
       VALUES (${platformUserId}::uuid, ${code}, ${topic.isEnabled})
       ON CONFLICT (user_id, topic_code) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled, updated_at = now()`,
    );
    written += 1;
  }
  return written;
}

/**
 * D1 entrypoint: ONE bounded transaction writes the retained integrator channel anchor plus the
 * canonical `public.platform_users` / `user_channel_bindings` (via the shared
 * `@bersoncare/platform-merge` identity-projection write) / `public.user_notification_topics`.
 *
 * Ordering inside the single tx:
 *   1. channel anchor (integrator-only identity, retained) → canonical integrator user id
 *   2. resolve/insert/enrich canonical `public.platform_users` + `public.user_channel_bindings`
 *   3. upsert `public.user_notification_topics`
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

    const mergeDbClient = txDb as PlatformMergeDbClient;

    // 2) Canonical public.platform_users + public.user_channel_bindings (shared implementation).
    const candidates = await collectPlatformUserCandidates(txDb, {
      integratorUserId,
      phoneNormalized,
      channelCode: input.channelCode,
      externalId: input.externalId,
    });

    let platformUserId: string;
    try {
      if (candidates.length === 0) {
        platformUserId = await insertIdentityProjection(mergeDbClient, {
          integratorUserId,
          phoneNormalized,
          displayName,
          firstName,
          lastName,
          email: null,
        });
      } else {
        platformUserId = await mergeCandidateIds(txDb, candidates);
        await enrichIdentityProjection(mergeDbClient, platformUserId, {
          integratorUserId,
          phoneNormalized,
          displayName,
          firstName,
          lastName,
          email: null,
          channelCode: input.channelCode,
        });
      }
    } catch (err) {
      if (
        err instanceof MergeConflictError &&
        (err.message === 'insertIdentityProjection: insert returned no id' ||
          err.message === 'enrichIdentityProjection: update matched no row')
      ) {
        throw new DirectPublicWriteError('platform_user_write_failed', {
          candidateIds: err.candidateIds,
        });
      }
      throw err;
    }

    const channelBindingInserted = await upsertChannelBindingForProjection(
      mergeDbClient,
      platformUserId,
      input.channelCode,
      input.externalId,
    );
    if (channelBindingInserted) {
      await seedChannelPreferencesDefaultsForProjection(
        mergeDbClient,
        platformUserId,
        input.channelCode,
        new Date(),
      );
    }

    // 3) public.user_notification_topics.
    const topicsWritten = await upsertNotificationTopics(txDb, platformUserId, topics);

    return { integratorUserId, platformUserId, channelBindingInserted, topicsWritten };
  });
}
