import { sql } from 'drizzle-orm';
import type { Pool, QueryResultRow } from 'pg';
/**
 * Domain SQL — `runIdentityClientPgText` / `runIdentityPoolPgTextOnPool`.
 */
import { getPool } from '@/infra/db/client';
import { getWebappSqlDb, runWebappNamedRoot, webappSqlFromPgText } from '@/infra/db/runWebappSql';
import { channelToBindingKey } from '@/modules/auth/channelContext';
import type {
  PhoneMessengerBindChannel,
  PhoneMessengerBindClaimRow,
  PhoneMessengerBindPort,
  PhoneMessengerBindPreOtpFailure,
} from '@/modules/auth/phoneMessengerBind.ports';
import {
  mapPhoneMessengerBindSecretRow,
  mapPhoneMessengerBindClaimRow,
  parseIdentityRow,
  preSessionMessengerChannelResolveSchema,
} from '@/infra/repos/identityPhoneRowSchemas';

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

async function runPhoneMessengerBindClaimRoot(params: {
  tokenHash: string;
  channelCode: PhoneMessengerBindChannel;
  externalId: string;
}) {
  const args = [params.tokenHash, params.channelCode, params.externalId] as const;
  return runWebappNamedRoot<{ code: string }>(
    getWebappSqlDb(),
    'app.phone_messenger_bind_claim(text,text,text)',
    args,
    webappSqlFromPgText(
      'SELECT app.phone_messenger_bind_claim($1::text, $2::text, $3::text) AS code',
      args,
    ),
  );
}

async function runPhoneMessengerBindClaimedSecretRoot(params: {
  tokenHash?: string;
  channelCode: PhoneMessengerBindChannel;
  externalId: string;
}) {
  const args = [params.tokenHash ?? null, params.channelCode, params.externalId] as const;
  return runWebappNamedRoot<PhoneMessengerBindClaimRow>(
    getWebappSqlDb(),
    'app.phone_messenger_bind_claimed_secret(text,text,text)',
    args,
    webappSqlFromPgText(
      'SELECT * FROM app.phone_messenger_bind_claimed_secret($1::text, $2::text, $3::text)',
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
 * classification. D15b/6 conflict-audit correction (2026-08-21): the root ITSELF now records the
 * `messenger_phone_bind_blocked` case in `admin_audit_log`, atomically, in the same statement that
 * decides the conflict — a caller-side follow-up transaction had no relation door under the bootstrap
 * principal and always failed before its first query, silently, leaving the admin manual-merge review
 * with no case to resolve. This JS layer no longer attempts that write.
 */
async function applyMessengerContactPreOtpImpl(
  params: {
    phoneNormalized: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    sessionUserId?: string | null;
  },
): Promise<{ ok: true; accountCreated: boolean } | PhoneMessengerBindPreOtpFailure> {
  const channelCode = params.channelCode;
  const key = channelToBindingKey(channelCode);
  if (!key) return { ok: false, code: 'unsupported_channel' };

  const sessionUserId = params.sessionUserId?.trim() || null;
  if (!sessionUserId) return { ok: false, code: 'session_required' };

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

// `_pool` kept only for call-site/test signature parity with the port factory family — this port no
// longer opens a raw relation transaction of its own (D15b/6 conflict-audit correction removed the
// last one, the bootstrap principal never had a door for it anyway).
export function createPgPhoneMessengerBindPort(_pool: Pool = getPool()): PhoneMessengerBindPort {
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

    async claimToken(params) {
      const result = await runPhoneMessengerBindClaimRoot(params);
      const code = result.rows[0]?.code;
      return { ok: code === 'claimed', code: typeof code === 'string' ? code : 'claim_failed' };
    },

    async findLiveClaim(params) {
      const result = await runPhoneMessengerBindClaimedSecretRoot(params);
      return result.rows[0] ? mapPhoneMessengerBindClaimRow(result.rows[0]) : null;
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

    applyMessengerContactPreOtp: applyMessengerContactPreOtpImpl,
  };
}
