import { sql } from 'drizzle-orm';
import type { Pool, PoolClient } from 'pg';

import { classifyMergeFailure, mergePlatformUsersInTransaction } from '@bersoncare/platform-merge';
import {
  getWebappSqlFromPgClient,
  runWebappSql,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import { upsertBroadcastDefaultsAfterChannelBind } from '@/infra/upsertBroadcastDefaultsAfterChannelBind';
import {
  CONTACTS,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
  mutateCanonicalUserContactsWebapp,
} from '@/infra/repos/userContactsSql';

export class ChannelLinkClaimRejectedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`channel_link_claim_rejected:${reason}`);
    this.name = 'ChannelLinkClaimRejectedError';
    this.reason = reason;
  }
}

export type ChannelBindingOwnerClass = { kind: 'disposable' } | { kind: 'real'; reason: string };

/**
 * Decide whether the current owner of a messenger binding can be displaced by a channel-link token
 * without a full platform merge. Conservative: any non-trivial patient data or OAuth on the stub → real.
 */
export async function classifyChannelBindingOwnerForLink(
  db: WebappSqlExecutor,
  stubUserId: string,
): Promise<ChannelBindingOwnerClass> {
  const pu = await runWebappSql<{
    merged_into_id: string | null;
    phone_normalized: string | null;
    role: string | null;
  }>(
    db,
    sql`SELECT merged_into_id::text AS merged_into_id, ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized, role::text AS role
     FROM platform_users pu
     ${sql.raw(USER_CONTACTS_PRIMARY_PHONE_LATERAL)}
     WHERE pu.id = ${stubUserId}::uuid`,
  );
  const row = pu.rows[0];
  if (!row) return { kind: 'real', reason: 'stub_user_missing' };
  if (row.merged_into_id) return { kind: 'real', reason: 'stub_already_merged' };
  if (row.role !== 'client') return { kind: 'real', reason: 'stub_role_not_client' };

  const phone = row.phone_normalized?.trim() ?? '';
  if (phone.length > 0) return { kind: 'real', reason: 'stub_has_phone' };

  const bindCount = await runWebappSql<{ c: string }>(
    db,
    sql`SELECT count(*)::text AS c FROM user_channel_bindings WHERE user_id = ${stubUserId}::uuid`,
  );
  const nBindings = Number.parseInt(bindCount.rows[0]?.c ?? '0', 10);
  if (!Number.isFinite(nBindings) || nBindings !== 1) {
    return {
      kind: 'real',
      reason: nBindings > 1 ? 'stub_multiple_channel_bindings' : 'stub_no_channel_bindings',
    };
  }

  const oauth = await runWebappSql<{ c: string }>(
    db,
    sql`SELECT count(*)::text AS c
     FROM app.auth_oauth_list_user_providers(${stubUserId}::uuid)`,
  );
  const nOauth = Number.parseInt(oauth.rows[0]?.c ?? '0', 10);
  if (Number.isFinite(nOauth) && nOauth > 0) return { kind: 'real', reason: 'stub_has_oauth' };

  const meaningfulSymptoms = await runWebappSql<{ c: string }>(
    db,
    sql`SELECT count(*)::text AS c
     FROM symptom_trackings st
     WHERE (st.platform_user_id = ${stubUserId}::uuid OR st.user_id = ${stubUserId}::text)
       AND st.deleted_at IS NULL
       AND (st.symptom_key IS NULL OR st.symptom_key NOT IN ('general_wellbeing', 'warmup_feeling'))`,
  );
  const nSym = Number.parseInt(meaningfulSymptoms.rows[0]?.c ?? '0', 10);
  if (Number.isFinite(nSym) && nSym > 0)
    return { kind: 'real', reason: 'stub_has_non_system_symptom_trackings' };

  const bookings = await runWebappSql<{ c: string }>(
    db,
    sql`SELECT count(*)::text AS c FROM patient_bookings WHERE platform_user_id = ${stubUserId}::uuid`,
  );
  if (Number.parseInt(bookings.rows[0]?.c ?? '0', 10) > 0)
    return { kind: 'real', reason: 'stub_has_bookings' };

  const notes = await runWebappSql<{ c: string }>(
    db,
    sql`SELECT count(*)::text AS c FROM doctor_notes WHERE user_id = ${stubUserId}::uuid`,
  );
  if (Number.parseInt(notes.rows[0]?.c ?? '0', 10) > 0)
    return { kind: 'real', reason: 'stub_has_doctor_notes' };

  const intake = await runWebappSql<{ c: string }>(
    db,
    sql`SELECT count(*)::text AS c FROM online_intake_requests WHERE user_id = ${stubUserId}::uuid`,
  );
  if (Number.parseInt(intake.rows[0]?.c ?? '0', 10) > 0)
    return { kind: 'real', reason: 'stub_has_online_intake' };

  const lfk = await runWebappSql<{ c: string }>(
    db,
    sql`SELECT count(*)::text AS c
     FROM patient_lfk_assignments WHERE patient_user_id = ${stubUserId}::uuid AND is_active = true`,
  );
  if (Number.parseInt(lfk.rows[0]?.c ?? '0', 10) > 0)
    return { kind: 'real', reason: 'stub_has_active_lfk_assignments' };

  return { kind: 'disposable' };
}

export type ClaimMessengerChannelBindingInput = {
  tokenUserId: string;
  stubUserId: string;
  channelCode: string;
  externalId: string;
  secretRowId: string;
};

export type ClaimMessengerChannelBindingResult =
  | { ok: true }
  | { ok: false; code: 'rejected'; reason: string }
  | { ok: false; code: 'failed'; err: unknown };

export type ChannelLinkOwnersMergeResult =
  { ok: true } | { ok: false; reason: string; candidateIds: string[] };

export async function tryMergeChannelLinkOwners(
  pool: Pool,
  params: {
    tokenUserId: string;
    existingUserId: string;
    secretRowId: string;
    channelCode: string;
  },
): Promise<ChannelLinkOwnersMergeResult> {
  try {
    await withPoolTransaction(pool, async (client) => {
      await mergePlatformUsersInTransaction(
        client,
        params.tokenUserId,
        params.existingUserId,
        'phone_bind',
        { mergeContext: { channel: params.channelCode } },
      );
      await runWebappSql(
        getWebappSqlFromPgClient(client),
        sql`SELECT app.auth_channel_link_mark_secret_used_if_unused(${params.secretRowId}::uuid) AS marked`,
      );
    });
    return { ok: true };
  } catch (err) {
    const classified = classifyMergeFailure(err, [params.tokenUserId, params.existingUserId]);
    return {
      ok: false,
      reason: classified.code,
      candidateIds:
        classified.candidateIds.length > 0
          ? classified.candidateIds
          : [params.tokenUserId, params.existingUserId],
    };
  }
}

export async function claimMessengerChannelBinding(
  pool: Pool,
  input: ClaimMessengerChannelBindingInput,
): Promise<ClaimMessengerChannelBindingResult> {
  try {
    await withPoolTransaction(pool, async (client) => {
      await claimMessengerChannelBindingInTransaction(client, input);
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ChannelLinkClaimRejectedError) {
      return { ok: false, code: 'rejected', reason: err.reason };
    }
    return { ok: false, code: 'failed', err };
  }
}

/**
 * Reassign `(channel_code, external_id)` to `tokenUserId`, soft-delete system wellbeing rows on the stub,
 * and mark the stub merged into the token holder. Caller must `BEGIN` on `client`.
 */
export async function claimMessengerChannelBindingInTransaction(
  client: PoolClient,
  input: ClaimMessengerChannelBindingInput,
): Promise<void> {
  const { tokenUserId, stubUserId, channelCode, externalId, secretRowId } = input;
  const db = getWebappSqlFromPgClient(client);

  await runWebappSql(
    db,
    sql`SELECT id FROM platform_users WHERE id IN (${tokenUserId}::uuid, ${stubUserId}::uuid) AND merged_into_id IS NULL FOR UPDATE`,
  );

  const recheck = await classifyChannelBindingOwnerForLink(db, stubUserId);
  if (recheck.kind !== 'disposable') {
    throw new ChannelLinkClaimRejectedError(recheck.reason);
  }

  const sec = await runWebappSql<{ locked: boolean }>(
    db,
    sql`SELECT app.auth_channel_link_lock_unused_secret(${secretRowId}::uuid) AS locked`,
  );
  if (sec.rows[0]?.locked !== true) {
    throw new Error(
      'claimMessengerChannelBindingInTransaction: channel_link_secret missing or already used',
    );
  }

  const bind = await runWebappSql<{ user_id: string }>(
    db,
    sql`SELECT user_id::text AS user_id
     FROM user_channel_bindings
     WHERE channel_code = ${channelCode} AND external_id = ${externalId}
     FOR UPDATE`,
  );
  if (bind.rows.length === 0) {
    throw new Error('claimMessengerChannelBindingInTransaction: binding row missing');
  }
  if (bind.rows[0]!.user_id !== stubUserId) {
    throw new Error('claimMessengerChannelBindingInTransaction: binding owner mismatch');
  }

  await runWebappSql(
    db,
    sql`UPDATE symptom_trackings
     SET is_active = false, deleted_at = now(), updated_at = now()
     WHERE (platform_user_id = ${stubUserId}::uuid OR user_id = ${stubUserId}::text)
       AND deleted_at IS NULL
       AND symptom_key IN ('general_wellbeing', 'warmup_feeling')`,
  );

  await runWebappSql(
    db,
    sql`UPDATE user_channel_bindings SET user_id = ${tokenUserId}::uuid
     WHERE channel_code = ${channelCode} AND external_id = ${externalId} AND user_id = ${stubUserId}::uuid`,
  );

  await upsertBroadcastDefaultsAfterChannelBind(
    getWebappSqlFromPgClient(client),
    tokenUserId,
    channelCode,
  );

  await mutateCanonicalUserContactsWebapp(client, stubUserId, [{ action: 'remove-all' }]);

  await runWebappSql(
    db,
    sql`UPDATE platform_users
     SET merged_into_id = ${tokenUserId}::uuid,
         merged_at = now(),
         updated_at = now()
     WHERE id = ${stubUserId}::uuid AND merged_into_id IS NULL`,
  );

  await runWebappSql(
    db,
    sql`SELECT app.auth_channel_link_mark_secret_used_if_unused(${secretRowId}::uuid) AS marked`,
  );
}
