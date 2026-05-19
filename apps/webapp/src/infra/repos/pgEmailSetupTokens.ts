import { getPool } from "@/infra/db/client";
import type {
  EmailSetupTokenRow,
  EmailSetupTokensPort,
  IssueEmailSetupTokenParams,
} from "@/modules/auth/emailSetupTokens/ports";

export const pgEmailSetupTokensPort: EmailSetupTokensPort = {
  async revokeActiveForUserEmail(userId: string, emailNormalized: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE user_email_setup_tokens
       SET revoked_at = now()
       WHERE user_id = $1::uuid
         AND email_normalized = $2
         AND used_at IS NULL
         AND revoked_at IS NULL`,
      [userId, emailNormalized],
    );
  },

  async insertToken(params: IssueEmailSetupTokenParams): Promise<{ id: string }> {
    const pool = getPool();
    const res = await pool.query<{ id: string }>(
      `INSERT INTO user_email_setup_tokens (
         user_id, email_normalized, token_hash, expires_at, source, created_by_user_id
       ) VALUES ($1::uuid, $2, $3, $4::timestamptz, $5, $6::uuid)
       RETURNING id::text AS id`,
      [
        params.userId,
        params.emailNormalized,
        params.tokenHash,
        params.expiresAtIso,
        params.source,
        params.createdByUserId ?? null,
      ],
    );
    return { id: res.rows[0].id };
  },

  async deleteTokenById(id: string): Promise<void> {
    const pool = getPool();
    await pool.query(`DELETE FROM user_email_setup_tokens WHERE id = $1::uuid`, [id]);
  },

  async findByTokenHash(tokenHash: string): Promise<EmailSetupTokenRow | null> {
    const pool = getPool();
    const res = await pool.query<{
      id: string;
      user_id: string;
      email_normalized: string;
      expires_at: Date;
      used_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT id::text AS id, user_id::text AS user_id, email_normalized,
              expires_at, used_at, revoked_at
       FROM user_email_setup_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      emailNormalized: r.email_normalized,
      expiresAt: r.expires_at.toISOString(),
      usedAt: r.used_at?.toISOString() ?? null,
      revokedAt: r.revoked_at?.toISOString() ?? null,
    };
  },

  async markUsedById(id: string): Promise<boolean> {
    const pool = getPool();
    const res = await pool.query(
      `UPDATE user_email_setup_tokens
       SET used_at = now()
       WHERE id = $1::uuid
         AND used_at IS NULL
         AND revoked_at IS NULL
         AND expires_at >= now()`,
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  },
};
