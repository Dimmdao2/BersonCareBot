import type { Pool, PoolClient } from "pg";
import { getPool } from "@/infra/db/client";
import type {
  PhoneMessengerBindPort,
  PhoneMessengerBindSecretRow,
} from "@/modules/auth/phoneMessengerBind.ports";

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

    async updateFailed(id, failureCode) {
      await pool.query(
        `UPDATE phone_messenger_bind_secrets SET status = 'failed', failure_code = $2 WHERE id = $1`,
        [id, failureCode],
      );
    },

    async updateOtpReady(id, challengeId) {
      await pool.query(
        `UPDATE phone_messenger_bind_secrets
         SET status = 'otp_ready', challenge_id = $2, failure_code = NULL
         WHERE id = $1`,
        [id, challengeId],
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
  };
}
