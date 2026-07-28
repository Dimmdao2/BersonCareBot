/** Wave 3 phase 15B — domain SQL via `runWebappPgText`. */
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type { LoginTokenRow, LoginTokensPort } from '@/modules/auth/loginTokensPort';

function toDateField(v: Date | string): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

function nullableDateField(v: Date | string | null): Date | null {
  if (v == null) return null;
  return toDateField(v);
}

export const pgLoginTokensPort: LoginTokensPort = {
  async createPending(params): Promise<{ id: string }> {
    const res = await runWebappPgText<{ id: string }>(
      `SELECT app.auth_login_token_create(
         $1::text,
         $2::uuid,
         $3::text,
         $4::timestamptz
       )::text AS id`,
      [params.tokenHash, params.userId, params.method, params.expiresAt],
    );
    return { id: res.rows[0]!.id };
  },

  async findByTokenHash(tokenHash: string): Promise<LoginTokenRow | null> {
    const res = await runWebappPgText<{
      id: string;
      user_id: string;
      method: string;
      status: string;
      expires_at: Date | string;
      confirmed_at: Date | string | null;
      session_issued_at: Date | string | null;
    }>(
      `SELECT id::text AS id, user_id::text AS user_id, method, status,
              expires_at, confirmed_at, session_issued_at
       FROM app.auth_login_token_read($1::text)`,
      [tokenHash],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0]!;
    return {
      id: r.id,
      tokenHash,
      userId: r.user_id,
      method: r.method as LoginTokenRow['method'],
      status: r.status as LoginTokenRow['status'],
      expiresAt: toDateField(r.expires_at),
      confirmedAt: nullableDateField(r.confirmed_at),
      sessionIssuedAt: nullableDateField(r.session_issued_at),
    };
  },

  async markExpiredIfPast(_now: Date): Promise<void> {
    await runWebappPgText(`SELECT app.auth_login_token_expire_past()`, []);
  },

  async confirmByTokenHash(tokenHash: string, _now: Date): Promise<boolean> {
    const res = await runWebappPgText<{ confirmed: boolean }>(
      `SELECT app.auth_login_token_confirm($1::text) AS confirmed`,
      [tokenHash],
    );
    return res.rows[0]?.confirmed === true;
  },

  async markSessionIssued(tokenHash: string, _at: Date): Promise<void> {
    await runWebappPgText(`SELECT app.auth_login_token_mark_session_issued($1::text) AS marked`, [
      tokenHash,
    ]);
  },
};
