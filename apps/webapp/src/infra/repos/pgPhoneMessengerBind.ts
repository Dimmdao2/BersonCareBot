import type { Pool, PoolClient } from "pg";
import { getPool } from "@/infra/db/client";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import { applyPlatformUserPhoneHistoryTransition } from "@/infra/repos/pgPhoneHistory";
import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";
import { channelToBindingKey } from "@/modules/auth/channelContext";
import type {
  PhoneMessengerBindChannel,
  PhoneMessengerBindPort,
  PhoneMessengerBindPurpose,
  PhoneMessengerBindSecretRow,
} from "@/modules/auth/phoneMessengerBind.ports";

async function applyMessengerContactPreOtpImpl(
  client: PoolClient,
  params: {
    phoneNormalized: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    purpose: PhoneMessengerBindPurpose;
    sessionUserId?: string | null;
  },
): Promise<{ ok: true; accountCreated: boolean } | { ok: false; code: string }> {
  const channelCode = params.channelCode;
  const key = channelToBindingKey(channelCode);
  if (!key) return { ok: false, code: "unsupported_channel" };

  const existingByPhone = await client.query<{ id: string }>(
    `SELECT id FROM platform_users WHERE phone_normalized = $1 AND merged_into_id IS NULL FOR UPDATE`,
    [params.phoneNormalized],
  );

  if (params.purpose === "profile_bind") {
    const sessionId = params.sessionUserId?.trim();
    if (!sessionId) return { ok: false, code: "session_required" };
    const canonicalSession = (await resolveCanonicalUserId(client, sessionId)) ?? sessionId;
    if (existingByPhone.rows.length > 0 && existingByPhone.rows[0]!.id !== canonicalSession) {
      return { ok: false, code: "phone_owned_by_other_user" };
    }
    await client.query(
      `UPDATE platform_users SET phone_normalized = $1, updated_at = now() WHERE id = $2::uuid`,
      [params.phoneNormalized, canonicalSession],
    );
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: canonicalSession,
      newPhoneNormalized: params.phoneNormalized,
      source: "messenger",
    });
    const ins = await client.query(
      `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING user_id`,
      [canonicalSession, channelCode, params.externalId],
    );
    if (ins.rows[0]?.user_id && ins.rows[0].user_id !== canonicalSession) {
      return { ok: false, code: "channel_owned_by_other_user" };
    }
    await upsertBroadcastDefaultsAfterChannelBind(client, canonicalSession, channelCode);
    return { ok: true, accountCreated: false };
  }

  let userId: string;
  let accountCreated = false;
  if (existingByPhone.rows.length > 0) {
    userId = existingByPhone.rows[0]!.id;
  } else {
    const insert = await client.query<{ id: string }>(
      `INSERT INTO platform_users (phone_normalized, display_name, role)
       VALUES ($1, $2, 'client') RETURNING id`,
      [params.phoneNormalized, params.phoneNormalized],
    );
    userId = insert.rows[0]!.id;
    accountCreated = true;
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: userId,
      newPhoneNormalized: params.phoneNormalized,
      source: "messenger",
    });
  }

  const bindingOwner = await client.query<{ user_id: string }>(
    `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE`,
    [channelCode, params.externalId],
  );
  if (bindingOwner.rows.length > 0 && bindingOwner.rows[0]!.user_id !== userId) {
    const ownerCanonical =
      (await resolveCanonicalUserId(client, bindingOwner.rows[0]!.user_id)) ?? bindingOwner.rows[0]!.user_id;
    const userCanonical = (await resolveCanonicalUserId(client, userId)) ?? userId;
    if (ownerCanonical !== userCanonical) {
      return { ok: false, code: "channel_owned_by_other_user" };
    }
  }

  await client.query(
    `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [userId, channelCode, params.externalId],
  );
  await upsertBroadcastDefaultsAfterChannelBind(client, userId, channelCode);
  return { ok: true, accountCreated };
}

export function createPgPhoneMessengerBindPort(pool: Pool = getPool()): PhoneMessengerBindPort {
  return {
    async findByTokenHash(tokenHash) {
      const r = await pool.query<PhoneMessengerBindSecretRow>(
        `SELECT id, phone_normalized, channel_code, purpose, user_id, status, challenge_id, failure_code, expires_at, consumed_at
         FROM phone_messenger_bind_secrets WHERE token_hash = $1`,
        [tokenHash],
      );
      return r.rows[0] ?? null;
    },

    async deletePending(phoneNormalized, channelCode, purpose) {
      await pool.query(
        `DELETE FROM phone_messenger_bind_secrets
         WHERE phone_normalized = $1 AND channel_code = $2 AND purpose = $3 AND status = 'pending_contact'`,
        [phoneNormalized, channelCode, purpose],
      );
    },

    async insertSecret(params) {
      await pool.query(
        `INSERT INTO phone_messenger_bind_secrets
           (token_hash, phone_normalized, channel_code, purpose, user_id, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'pending_contact', $6)`,
        [
          params.tokenHash,
          params.phoneNormalized,
          params.channelCode,
          params.purpose,
          params.userId,
          params.expiresAtIso,
        ],
      );
    },

    async updateExpired(id) {
      await pool.query(`UPDATE phone_messenger_bind_secrets SET status = 'expired' WHERE id = $1`, [id]);
    },

    async updateFailed(id, failureCode, client) {
      const q = client ?? pool;
      await q.query(
        `UPDATE phone_messenger_bind_secrets SET status = 'failed', failure_code = $2 WHERE id = $1`,
        [id, failureCode],
      );
    },

    async updateOtpReady(id, challengeId, client) {
      const q = client ?? pool;
      await q.query(
        `UPDATE phone_messenger_bind_secrets
         SET status = 'otp_ready', challenge_id = $2, failure_code = NULL
         WHERE id = $1`,
        [id, challengeId],
      );
    },

    async markConsumed(id, client) {
      const q = client ?? pool;
      await q.query(
        `UPDATE phone_messenger_bind_secrets SET status = 'consumed', consumed_at = now()
         WHERE id = $1 AND status <> 'consumed'`,
        [id],
      );
    },

    async markConsumedByChallenge(challengeId) {
      await pool.query(
        `UPDATE phone_messenger_bind_secrets SET status = 'consumed', consumed_at = now()
         WHERE challenge_id = $1 AND status = 'otp_ready'`,
        [challengeId],
      );
    },

    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },

    applyMessengerContactPreOtp: applyMessengerContactPreOtpImpl,
  };
}
