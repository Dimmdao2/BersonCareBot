/**
 * D25 correction (owner decision 23.08.2026, "Роль бота после появления приложения"): `user.upsert`
 * (Telegram/MAX webhooks) is now LOOKUP-ONLY.
 *
 * `upsertBootstrapChannelIdentity` is the single exact named root
 * (`app.integrator_upsert_channel_identity`) for canonical `public.platform_users` /
 * `public.user_channel_bindings` channel-identity RESOLUTION, used for every principal (bootstrap and
 * organization/integrator alike — see `writePort.ts` `user.upsert`). It never opens a relation
 * transaction. A generic Telegram/MAX webhook proves nothing about phone ownership — an unresolved
 * `externalId` returns `null` and creates NOTHING (no `platform_users`, no `user_identity`, no
 * `user_channel_bindings`, no `user_channel_preferences` row). The root's own SQL body
 * (`app.integrator_upsert_channel_identity`, migration
 * `20260823T093000_channel_identity_root_becomes_lookup_only.sql`) removed the INSERT branch entirely
 * — this is not a TS-side filter around a still-creating root. Canonical account creation/binding
 * belongs exclusively to webapp-owned completion of the token-bound
 * `POST /api/auth/phone/messenger-bind/start` → `webapp.phoneMessengerBind.complete` flow
 * (`applyMessengerContactPreOtp`, `app.phone_messenger_bind_completion_state`) — never to a bare
 * webhook.
 *
 * `collectPlatformUserCandidates` remains a thin wrapper over the shared
 * `@bersoncare/platform-merge` candidate lookup, used by other bounded direct-public writers
 * (`resolveDirectPublicActor.ts`, `writeReminderRulesDirect.ts`, `content.access.grant.create` in
 * `writePort.ts`) that still need to resolve an existing canonical person without creating one.
 */
import { sql } from 'drizzle-orm';
import {
  collectIdentityProjectionCandidates as collectIdentityProjectionCandidatesShared,
  MergeConflictError,
  type PlatformMergeDbClient,
} from '@bersoncare/platform-merge';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

export type DirectPublicChannelCode = 'telegram' | 'max';

export type WriteIdentityAndPreferencesResult = {
  platformUserId: string;
  channelBindingInserted: boolean;
  topicsWritten: number;
};

/**
 * Lookup-only: resolves an EXISTING `platform_users` row bound to this channel identity. Returns
 * `null` when no such binding exists — the root does not create one (see module header). Callers
 * MUST treat `null` as "unresolved actor", never as an error: a generic webhook from an unknown
 * messenger id is an expected, ordinary case, not a failure.
 */
export async function upsertBootstrapChannelIdentity(
  db: DbPort,
  input: {
    channelCode: DirectPublicChannelCode;
    externalId: string;
    displayHandle?: string | null;
  },
): Promise<WriteIdentityAndPreferencesResult | null> {
  const displayHandle = normalizeChannelDisplayHandle(input.displayHandle);
  const result = await runIntegratorNamedRoot<{
    platform_user_id: string;
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
  if (!row) return null;
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
