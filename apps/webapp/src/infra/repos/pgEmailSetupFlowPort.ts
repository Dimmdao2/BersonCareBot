/** Wave 3 phase 15B — domain SQL via `runWebappPgText`; TX on `applyEmailSetupCompletion`. */
import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import type { EmailSetupFlowPort } from "@/modules/auth/emailSetupFlow/ports";

export const pgEmailSetupFlowPort: EmailSetupFlowPort = {
  async assertContactEmailForSetup({ userId, emailNormalized }) {
    const r = await runWebappPgText<{
      email: string | null;
      email_normalized: string | null;
      email_verified_at: Date | string | null;
      has_password: boolean;
    }>(
      `SELECT pu.email,
              pu.email_normalized,
              pu.email_verified_at,
              EXISTS (
                SELECT 1 FROM user_password_credentials upc WHERE upc.user_id = pu.id
              ) AS has_password
       FROM platform_users pu
       WHERE pu.id = $1::uuid
         AND pu.merged_into_id IS NULL
       LIMIT 1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row?.email_normalized) {
      return { ok: false, reason: "user_not_found" };
    }
    if (row.email_normalized !== emailNormalized) {
      return { ok: false, reason: "email_mismatch" };
    }
    if (row.email_verified_at != null && row.has_password) {
      return { ok: false, reason: "already_has_login" };
    }
    return { ok: true, email: row.email ?? emailNormalized };
  },

  async applyEmailSetupCompletion({ userId, emailNormalized, passwordHash, setupTokenId }) {
    try {
      return await runWebappTransaction(async (tx) => {
        const userRes = await runWebappPgText<{ id: string }>(
          `UPDATE platform_users
           SET email_verified_at = now(), updated_at = now()
           WHERE id = $1::uuid
             AND merged_into_id IS NULL
             AND email_normalized = $2
           RETURNING id::text AS id`,
          [userId, emailNormalized],
          tx,
        );
        if (!userRes.rows[0]) {
          tx.rollback();
          return { ok: false, reason: "email_mismatch" as const };
        }

        await runWebappPgText(
          `INSERT INTO user_password_credentials (user_id, password_hash, updated_at)
           VALUES ($1::uuid, $2::text, now())
           ON CONFLICT (user_id) DO UPDATE
           SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
          [userId, passwordHash],
          tx,
        );

        const tokenRes = await runWebappPgText(
          `UPDATE user_email_setup_tokens
           SET used_at = now()
           WHERE id = $1::uuid
             AND used_at IS NULL
             AND revoked_at IS NULL
             AND expires_at >= now()`,
          [setupTokenId],
          tx,
        );
        if ((tokenRes.rowCount ?? 0) === 0) {
          tx.rollback();
          return { ok: false, reason: "token_consume_failed" as const };
        }

        return { ok: true as const };
      });
    } catch {
      return { ok: false, reason: "user_not_found" as const };
    }
  },
};
