import { sql } from 'drizzle-orm';
import type { Pool, QueryResultRow } from 'pg';
/**
 * Domain SQL — `runIdentityClientSql` / `runIdentityPoolSqlOnPool`.
 */
import { getPool } from '@/infra/db/client';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  PhoneMessengerBindChannel,
  PhoneMessengerBindClaimRow,
  PhoneMessengerBindPort,
} from '@/modules/auth/phoneMessengerBind.ports';
import {
  mapPhoneMessengerBindSecretRow,
  mapPhoneMessengerBindClaimRow,
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
    args,
    sql`SELECT * FROM app.phone_messenger_bind_secret(
        ${action}::text, ${tokenHash}::text, ${secretId}::uuid, ${phoneNormalized}::text, ${channelCode}::text,
        ${purpose}::text, ${userId}::uuid, ${challengeId}::text, ${failureCode}::text, ${expiresAtIso}::timestamptz
      )`,
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
    sql`SELECT app.phone_messenger_bind_claim(${params.tokenHash}::text, ${params.channelCode}::text, ${params.externalId}::text) AS code`,
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
    sql`SELECT * FROM app.phone_messenger_bind_claimed_secret(${params.tokenHash ?? null}::text, ${params.channelCode}::text, ${params.externalId}::text)`,
  );
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
  };
}
