/**
 * D15b/2 — live write path for `user.upsert` (Telegram/MAX webhooks).
 *
 * One bounded integrator transaction that writes the canonical webapp tables directly via
 * qualified `public.*`:
 *   - `public.platform_users`          (canonical person; insert or enrich)
 *   - `public.user_channel_bindings`   (messenger identity → platform user)
 *
 * The actual `platform_users`/`user_channel_bindings` write is the shared
 * `@bersoncare/platform-merge` `identityProjectionWrite` implementation — the SAME code the webapp's
 * `pgUserProjection.ts` calls on its own pool transaction. This file owns only what is genuinely
 * integrator-specific: the cross-webhook advisory lock and the
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
import { runIntegratorNamedRoot, runIntegratorSql } from '../runIntegratorSql.js';

export type DirectPublicChannelCode = 'telegram' | 'max';

/**
 * D1 identity input. Shape matches the `user.upsert` mutation semantics in writePort.ts
 * (resource/externalId/username/firstName/lastName) plus optional notification topics.
 */
export type DirectPublicIdentityInput = {
  channelCode: DirectPublicChannelCode;
  externalId: string;
  displayHandle?: string | null;
  phoneNormalized?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Notification preferences to upsert into `public.user_notification_topics` (optional). */
  topics?: ReadonlyArray<{ topicCode: string; isEnabled: boolean }>;
};

export type WriteIdentityAndPreferencesDeps = {
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
  platformUserId: string;
  channelBindingInserted: boolean;
  topicsWritten: number;
};

export async function upsertBootstrapChannelIdentity(
  db: DbPort,
  input: Pick<DirectPublicIdentityInput, 'channelCode' | 'externalId' | 'displayHandle'>,
): Promise<WriteIdentityAndPreferencesResult> {
  const displayHandle = normalizeChannelDisplayHandle(input.displayHandle);
  const result = await runIntegratorNamedRoot<{
    platform_user_id: string;
    account_created: boolean;
    channel_binding_inserted: boolean;
  }>(
    db,
    'app.integrator_upsert_channel_identity(text,text,text)',
    [input.channelCode, input.externalId, displayHandle],
    sql`SELECT * FROM app.integrator_upsert_channel_identity(
      ${input.channelCode}::text,
      ${input.externalId}::text,
      ${displayHandle}::text
    )`,
  );
  const row = result.rows[0];
  if (!row) throw new DirectPublicWriteError('platform_user_write_failed');
  return {
    platformUserId: row.platform_user_id,
    channelBindingInserted: row.channel_binding_inserted,
    topicsWritten: 0,
  };
}

export type DirectPublicWriteFailureCode =
  | 'channel_anchor_owned_by_other_user'
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

const CHANNEL_DISPLAY_HANDLE_MAX_LENGTH = 32;

export function normalizeChannelDisplayHandle(value: string | null | undefined): string | null {
  const trimmed = trimmedOrNull(value)?.replace(/^@+/, '').trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, CHANNEL_DISPLAY_HANDLE_MAX_LENGTH);
}

/** Serialize writes for the canonical channel key; no integrator-local anchor is created. */
async function lockOnChannelIdentity(
  txDb: DbPort,
  channelCode: string,
  externalId: string,
): Promise<void> {
  await runIntegratorSql(
    txDb,
    sql`SELECT pg_advisory_xact_lock(hashtextextended('direct-public-channel:' || ${channelCode}::text || ':' || ${externalId}::text, 0))`,
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
    integratorUserId?: string | null;
    phoneNormalized: string | null;
    channelCode: string;
    externalId: string;
  },
): Promise<string[]> {
  try {
    return await collectIdentityProjectionCandidatesShared(txDb as PlatformMergeDbClient, input);
  } catch (err) {
    if (err instanceof MergeConflictError) {
      if (err.message === 'channel_anchor_owned_by_other_user') {
        throw new DirectPublicWriteError('channel_anchor_owned_by_other_user', {
          candidateIds: err.candidateIds,
        });
      }
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
 * D1 entrypoint: ONE bounded transaction writes canonical `public.platform_users` /
 * `user_channel_bindings` (via the shared
 * `@bersoncare/platform-merge` identity-projection write) / `public.user_notification_topics`.
 *
 * Ordering inside the single tx:
 *   1. lock the canonical channel key
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
  const displayHandle = normalizeChannelDisplayHandle(input.displayHandle);
  const displayName = trimmedOrNull(input.displayName);
  const firstName = trimmedOrNull(input.firstName);
  const lastName = trimmedOrNull(input.lastName);
  const topics = input.topics ?? [];

  return db.tx(async (txDb) => {
    await lockOnChannelIdentity(txDb, input.channelCode, input.externalId);

    const mergeDbClient = txDb as PlatformMergeDbClient;

    // 2) Canonical public.platform_users + public.user_channel_bindings (shared implementation).
    const candidates = await collectPlatformUserCandidates(txDb, {
      integratorUserId: null,
      phoneNormalized,
      channelCode: input.channelCode,
      externalId: input.externalId,
    });

    let platformUserId: string;
    try {
      if (candidates.length === 0) {
        platformUserId = await insertIdentityProjection(mergeDbClient, {
          integratorUserId: null,
          phoneNormalized,
          displayName,
          firstName,
          lastName,
          email: null,
        });
      } else {
        platformUserId = await mergeCandidateIds(txDb, candidates);
        await enrichIdentityProjection(mergeDbClient, platformUserId, {
          integratorUserId: null,
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
      displayHandle,
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

    return { platformUserId, channelBindingInserted, topicsWritten };
  });
}
