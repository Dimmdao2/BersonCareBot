/** Wave 3 phase 15B — domain SQL via `runWebappPgText`. */
import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { LoginTokenRow, LoginTokensPort } from "@/modules/auth/loginTokensPort";

function toDateField(v: Date | string): Date {
  return typeof v === "string" ? new Date(v) : v;
}

function nullableDateField(v: Date | string | null): Date | null {
  if (v == null) return null;
  return toDateField(v);
}

export const pgLoginTokensPort: LoginTokensPort = {
  async createPending(params): Promise<{ id: string }> {
    const res = await runWebappPgText<{ id: string }>(
      `INSERT INTO login_tokens (token_hash, user_id, method, status, expires_at)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id`,
      [params.tokenHash, params.userId, params.method, params.expiresAt],
    );
    return { id: res.rows[0]!.id };
  },

  async findByTokenHash(tokenHash: string): Promise<LoginTokenRow | null> {
    const res = await runWebappPgText<{
      id: string;
      token_hash: string;
      user_id: string;
      method: string;
      status: string;
      expires_at: Date | string;
      confirmed_at: Date | string | null;
      session_issued_at: Date | string | null;
    }>(
      `SELECT id, token_hash, user_id, method, status, expires_at, confirmed_at, session_issued_at
       FROM login_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0]!;
    return {
      id: r.id,
      tokenHash: r.token_hash,
      userId: r.user_id,
      method: r.method as LoginTokenRow["method"],
      status: r.status as LoginTokenRow["status"],
      expiresAt: toDateField(r.expires_at),
      confirmedAt: nullableDateField(r.confirmed_at),
      sessionIssuedAt: nullableDateField(r.session_issued_at),
    };
  },

  async markExpiredIfPast(now: Date): Promise<void> {
    await runWebappPgText(
      `UPDATE login_tokens SET status = 'expired'
       WHERE status = 'pending' AND expires_at < $1`,
      [now],
    );
  },

  async confirmByTokenHash(tokenHash: string, now: Date): Promise<boolean> {
    const res = await runWebappPgText(
      `UPDATE login_tokens SET status = 'confirmed', confirmed_at = $2
       WHERE token_hash = $1 AND status = 'pending' AND expires_at >= $2`,
      [tokenHash, now],
    );
    return (res.rowCount ?? 0) > 0;
  },

  async markSessionIssued(tokenHash: string, at: Date): Promise<void> {
    await runWebappPgText(
      `UPDATE login_tokens SET session_issued_at = $2
       WHERE token_hash = $1 AND session_issued_at IS NULL`,
      [tokenHash, at],
    );
  },
};
