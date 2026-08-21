import { sql } from 'drizzle-orm';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
/**
 * Wave 3 phase 12B — Class C transport: `client.query("BEGIN"|"COMMIT"|"ROLLBACK")` in `withTransaction`.
 * Domain SQL — `runIdentityClientPgText` / `runIdentityPoolPgTextOnPool`; platform-merge bridge via same client executor.
 */
import {
  enrichMessengerBindAuditDetailsFields,
  type MessengerPhoneBindDb,
} from '@bersoncare/platform-merge';
import {
  computeConflictKeyFromCandidateIds,
  currentAuditOrganizationId,
  type AuditLogStatus,
} from '@/infra/adminAuditLog';
import { getPool } from '@/infra/db/client';
import { getWebappSqlDb, runWebappNamedRoot, webappSqlFromPgText } from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import { channelToBindingKey } from '@/modules/auth/channelContext';
import type {
  PhoneMessengerBindChannel,
  PhoneMessengerBindPort,
  PhoneMessengerBindPreOtpFailure,
  PhoneMessengerBindPurpose,
} from '@/modules/auth/phoneMessengerBind.ports';
import {
  auditLogRepeatRowSchema,
  mapPhoneMessengerBindSecretRow,
  parseIdentityRow,
  preSessionMessengerChannelResolveSchema,
} from '@/infra/repos/identityPhoneRowSchemas';
import { runIdentityClientPgText } from '@/infra/repos/identityPhoneSql';

function asMessengerPhoneBindDb(client: PoolClient): MessengerPhoneBindDb {
  return {
    async query<R extends QueryResultRow = QueryResultRow>(queryText: string, values?: unknown[]) {
      const result = await runIdentityClientPgText<R>(client, queryText, values ?? []);
      return { rows: result.rows, rowCount: result.rowCount ?? undefined };
    },
  };
}

async function runPhoneMessengerBindSecretRoot<T extends QueryResultRow = QueryResultRow>(
  action: string,
  tokenHash: string | null,
  secretId: string | null,
  phoneNormalized: string | null,
  channelCode: string | null,
  purpose: string | null,
  userId: string | null,
  challengeId: string | null,
  failureCode: string | null,
  expiresAtIso: string | null,
) {
  const args = [
    action,
    tokenHash,
    secretId,
    phoneNormalized,
    channelCode,
    purpose,
    userId,
    challengeId,
    failureCode,
    expiresAtIso,
  ];
  return runWebappNamedRoot<T>(
    getWebappSqlDb(),
    'app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamp with time zone)',
    [
      action,
      tokenHash,
      secretId,
      phoneNormalized,
      channelCode,
      purpose,
      userId,
      challengeId,
      failureCode,
      expiresAtIso,
    ],
    webappSqlFromPgText(
      `SELECT * FROM app.phone_messenger_bind_secret(
        $1::text, $2::text, $3::uuid, $4::text, $5::text,
        $6::text, $7::uuid, $8::text, $9::text, $10::timestamptz
      )`,
      args,
    ),
  );
}

type PhoneMessengerBindCompletionStateRow = QueryResultRow & {
  ready: boolean;
  account_created: boolean;
  sync_target_user_id: string | null;
  canonical_user_id: string | null;
};

async function runPhoneMessengerBindCompletionStateRoot(params: {
  tokenHash: string;
  channelCode: PhoneMessengerBindChannel;
  externalId: string;
  contactPhoneNormalized: string;
}) {
  const args = [
    params.tokenHash,
    params.channelCode,
    params.externalId,
    params.contactPhoneNormalized,
  ] as const;
  return runWebappNamedRoot<PhoneMessengerBindCompletionStateRow>(
    getWebappSqlDb(),
    'app.phone_messenger_bind_completion_state(text,text,text,text)',
    [
      params.tokenHash,
      params.channelCode,
      params.externalId,
      params.contactPhoneNormalized,
    ],
    webappSqlFromPgText(
      `SELECT * FROM app.phone_messenger_bind_completion_state($1::text, $2::text, $3::text, $4::text)`,
      args,
    ),
  );
}

/**
 * D15b/6 messenger confirm-path correction. This used to open its own relation transaction
 * (`auth_phone_bind_lock_channel_binding`-style raw SQL, `mergePlatformUsersInTransaction` /
 * `applyMessengerPhonePublicBind` for a channel/phone-owner conflict) under whatever principal the
 * caller's `withTransaction` happened to install — for both reachable callers (the signed integrator
 * webhook and `createOrBind`'s messenger branch) that principal is the bootstrap principal, which has
 * no unnamed relation door (`portContextRuntime.ts`, `capabilities['pre_session']` purpose=relation is
 * intentionally absent). One named SECURITY DEFINER root
 * (`app.pre_session_messenger_channel_resolve`, same owner as `app.pre_session_phone_confirm_resolve`)
 * now resolves-or-creates the canonical holder for a messenger channel binding atomically and returns
 * the full session-identity payload. A channel-owner/phone-owner/session-owner disagreement is a real
 * merge decision `mergePlatformUsersInTransaction` (`packages/platform-merge`, ~1.6k lines) cannot run
 * under this principal and this root does not duplicate — it fails closed with `outcome: 'conflict'`
 * and the candidate ids, which this function maps to the existing `merge_blocked_ambiguous_candidates`
 * classification so the caller's already-established manual-merge review path
 * (`recordMessengerBindBlocked` → `admin_audit_log`) picks it up exactly like any other blocked merge.
 */
async function applyMessengerContactPreOtpImpl(
  params: {
    phoneNormalized: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    purpose: PhoneMessengerBindPurpose;
    sessionUserId?: string | null;
  },
): Promise<{ ok: true; accountCreated: boolean } | PhoneMessengerBindPreOtpFailure> {
  const channelCode = params.channelCode;
  const key = channelToBindingKey(channelCode);
  if (!key) return { ok: false, code: 'unsupported_channel' };

  let sessionUserId: string | null = null;
  if (params.purpose === 'profile_bind') {
    sessionUserId = params.sessionUserId?.trim() || null;
    if (!sessionUserId) return { ok: false, code: 'session_required' };
  }

  const result = await runWebappNamedRoot<{ result: unknown }>(
    getWebappSqlDb(),
    'app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)',
    [channelCode, params.externalId, params.phoneNormalized, null, channelCode, sessionUserId],
    sql`SELECT app.pre_session_messenger_channel_resolve(
      ${channelCode}::text,
      ${params.externalId}::text,
      ${params.phoneNormalized}::text,
      ${null}::text,
      ${channelCode}::text,
      ${sessionUserId}::uuid
    ) AS result`,
  );
  const payload = parseIdentityRow(
    preSessionMessengerChannelResolveSchema,
    result.rows[0]?.result,
    'pre_session_messenger_channel_resolve',
  );
  if (payload.outcome === 'conflict') {
    if (payload.candidate_ids && payload.candidate_ids.length > 0) {
      return { ok: false, code: 'merge_blocked_ambiguous_candidates', candidateIds: payload.candidate_ids };
    }
    return { ok: false, code: 'invalid_phone' };
  }
  // D2 (2026-07-26): an archived identity has no session — see `loadSessionIdentityUser`.
  if (payload.is_archived) {
    return { ok: false, code: 'account_archived' };
  }
  return { ok: true, accountCreated: payload.was_created };
}

async function recordMessengerBindBlockedImpl(
  client: PoolClient,
  params: {
    reason: string;
    candidateIds: string[];
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    phoneNormalized: string;
    source: string;
  },
): Promise<void> {
  const candidateIds = [...new Set(params.candidateIds.map((id) => id.trim()).filter(Boolean))];
  const phoneSuffix = params.phoneNormalized.replace(/\D/g, '').slice(-4) || '****';
  let conflictKey: string | null = null;
  if (candidateIds.length > 0) {
    try {
      conflictKey = computeConflictKeyFromCandidateIds(candidateIds);
    } catch {
      conflictKey = null;
    }
  }

  let enrichedFields: Record<string, unknown> = {};
  try {
    enrichedFields = await enrichMessengerBindAuditDetailsFields(asMessengerPhoneBindDb(client), {
      reason: params.reason,
      candidateIds,
      channelCode: params.channelCode,
      externalId: params.externalId,
    });
  } catch {
    enrichedFields = {};
  }

  const baseDetails = {
    reason: params.reason,
    candidateIds,
    channelCode: params.channelCode,
    externalId: params.externalId,
    phoneSuffix,
    source: params.source,
    ...enrichedFields,
  };
  const status: AuditLogStatus = 'error';
  const organizationId = currentAuditOrganizationId();

  if (!conflictKey) {
    await runIdentityClientPgText(
      client,
      `INSERT INTO admin_audit_log (organization_id, actor_id, action, target_id, conflict_key, details, status)
       VALUES ($1::uuid, NULL, 'messenger_phone_bind_anomaly', $2, NULL, $3::jsonb, $4)`,
      [organizationId, candidateIds[0] ?? null, JSON.stringify(baseDetails), status],
    );
    return;
  }

  const existing = await runIdentityClientPgText(
    client,
    `SELECT id::text, repeat_count
     FROM admin_audit_log
     WHERE conflict_key = $1 AND resolved_at IS NULL
     FOR UPDATE
     LIMIT 1`,
    [conflictKey],
  );
  if (existing.rows[0]) {
    const row = parseIdentityRow(auditLogRepeatRowSchema, existing.rows[0], 'audit_log_repeat');
    await runIdentityClientPgText(
      client,
      `UPDATE admin_audit_log
       SET details = details || $2::jsonb,
           repeat_count = repeat_count + 1,
           last_seen_at = now(),
           status = $3
       WHERE id = $1::uuid`,
      [row.id, JSON.stringify(baseDetails), status],
    );
    return;
  }

  await runIdentityClientPgText(
    client,
    `INSERT INTO admin_audit_log
       (organization_id, actor_id, action, target_id, conflict_key, details, status, repeat_count, last_seen_at)
     VALUES ($1::uuid, NULL, 'messenger_phone_bind_blocked', $2, $3, $4::jsonb, $5, 1, now())
     ON CONFLICT (conflict_key) WHERE resolved_at IS NULL DO UPDATE
       SET details = admin_audit_log.details || EXCLUDED.details,
           repeat_count = admin_audit_log.repeat_count + 1,
           last_seen_at = now(),
           status = EXCLUDED.status`,
    [organizationId, candidateIds[0] ?? null, conflictKey, JSON.stringify(baseDetails), status],
  );
}

export function createPgPhoneMessengerBindPort(pool: Pool = getPool()): PhoneMessengerBindPort {
  return {
    async findByTokenHash(tokenHash) {
      const r = await runPhoneMessengerBindSecretRoot(
        'find',
        tokenHash,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      );
      return r.rows[0] ? mapPhoneMessengerBindSecretRow(r.rows[0]) : null;
    },

    async startSecret(params) {
      await runPhoneMessengerBindSecretRoot(
        'start',
        params.tokenHash,
        null,
        params.phoneNormalized,
        params.channelCode,
        params.purpose,
        params.userId,
        null,
        null,
        params.expiresAtIso,
      );
    },

    async updateExpired(id) {
      await runPhoneMessengerBindSecretRoot(
        'expire',
        null,
        id,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      );
    },

    async updateFailed(id, failureCode) {
      await runPhoneMessengerBindSecretRoot(
        'fail',
        null,
        id,
        null,
        null,
        null,
        null,
        null,
        failureCode,
        null,
      );
    },

    async updateOtpReady(id, challengeId) {
      await runPhoneMessengerBindSecretRoot(
        'otp_ready',
        null,
        id,
        null,
        null,
        null,
        null,
        challengeId,
        null,
        null,
      );
    },

    async markConsumed(id) {
      await runPhoneMessengerBindSecretRoot(
        'consume',
        null,
        id,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      );
    },

    async markConsumedByChallenge(challengeId) {
      await runPhoneMessengerBindSecretRoot(
        'consume_challenge',
        null,
        null,
        null,
        null,
        null,
        null,
        challengeId,
        null,
        null,
      );
    },

    async verifyCompletionState(params) {
      const result = await runPhoneMessengerBindCompletionStateRoot(params);
      const row = result.rows[0];
      return {
        ready: row?.ready === true,
        accountCreated: row?.account_created === true,
        syncTargetUserId:
          typeof row?.sync_target_user_id === 'string' ? row.sync_target_user_id : null,
        canonicalUserId:
          typeof row?.canonical_user_id === 'string' ? row.canonical_user_id : null,
      };
    },

    async withTransaction(fn) {
      return withPoolTransaction(pool, fn);
    },

    applyMessengerContactPreOtp: applyMessengerContactPreOtpImpl,
    recordMessengerBindBlocked: recordMessengerBindBlockedImpl,
  };
}
