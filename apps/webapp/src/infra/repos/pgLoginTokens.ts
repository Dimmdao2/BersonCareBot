import { getPool } from "@/infra/db/client";
import type { LoginTokenRow, LoginTokensPort } from "@/modules/auth/loginTokensPort";

export const pgLoginTokensPort: LoginTokensPort = {
  async createPending(params): Promise<{ id: string }> {
    const pool = getPool();
    const res = await pool.query<{ id: string }>(
      `INSERT INTO login_tokens (token_hash, user_id, method, status, expires_at)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id`,
      [params.tokenHash, params.userId, params.method, params.expiresAt]
    );
    return { id: res.rows[0].id };
  },

  async findByTokenHash(tokenHash: string): Promise<LoginTokenRow | null> {
    const pool = getPool();
    const res = await pool.query<{
      id: string;
      token_hash: string;
      user_id: string;
      method: string;
      status: string;
      expires_at: Date;
      confirmed_at: Date | null;
      session_issued_at: Date | null;
    }>(
      `SELECT id, token_hash, user_id, method, status, expires_at, confirmed_at, session_issued_at
       FROM login_tokens WHERE token_hash = $1`,
      [tokenHash]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      tokenHash: r.token_hash,
      userId: r.user_id,
      method: r.method as LoginTokenRow["method"],
      status: r.status as LoginTokenRow["status"],
      expiresAt: r.expires_at,
      confirmedAt: r.confirmed_at,
      sessionIssuedAt: r.session_issued_at,
    };
  },

  async markExpiredIfPast(now: Date): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE login_tokens SET status = 'expired'
       WHERE status = 'pending' AND expires_at < $1`,
      [now]
    );
  },

  async confirmByTokenHash(tokenHash: string, now: Date): Promise<boolean> {
    const pool = getPool();
    const res = await pool.query(
      `UPDATE login_tokens SET status = 'confirmed', confirmed_at = $2
       WHERE token_hash = $1 AND status = 'pending' AND expires_at >= $2`,
      [tokenHash, now]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async markSessionIssued(tokenHash: string, at: Date): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE login_tokens SET session_issued_at = $2
       WHERE token_hash = $1 AND session_issued_at IS NULL`,
      [tokenHash, at]
    );
  },
};
