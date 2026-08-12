import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
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
    const res = await runWebappNamedRoot<{ id: string }>(
      getWebappSqlDb(),
      'app.auth_login_token_create(text,uuid,text,timestamp with time zone)',
      [params.tokenHash, params.userId, params.method, params.expiresAt],
      sql`SELECT app.auth_login_token_create(
        ${params.tokenHash},
        ${params.userId}::uuid,
        ${params.method},
        ${params.expiresAt.toISOString()}::timestamptz
      )::text AS id`,
    );
    return { id: res.rows[0]!.id };
  },

  async findByTokenHash(tokenHash: string): Promise<LoginTokenRow | null> {
    const res = await runWebappNamedRoot<{
      id: string;
      user_id: string;
      method: string;
      status: string;
      expires_at: Date | string;
      confirmed_at: Date | string | null;
      session_issued_at: Date | string | null;
    }>(
      getWebappSqlDb(),
      'app.auth_login_token_read(text)',
      [tokenHash],
      sql`SELECT id::text AS id, user_id::text AS user_id, method, status,
                 expires_at, confirmed_at, session_issued_at
          FROM app.auth_login_token_read(${tokenHash})`,
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
    await runWebappNamedRoot(
      getWebappSqlDb(),
      'app.auth_login_token_expire_past()',
      [],
      sql`SELECT app.auth_login_token_expire_past()`,
    );
  },

  async confirmByTokenHash(tokenHash: string, _now: Date): Promise<boolean> {
    const res = await runWebappNamedRoot<{ confirmed: boolean }>(
      getWebappSqlDb(),
      'app.auth_login_token_confirm(text)',
      [tokenHash],
      sql`SELECT app.auth_login_token_confirm(${tokenHash}) AS confirmed`,
    );
    return res.rows[0]?.confirmed === true;
  },

  async markSessionIssued(tokenHash: string, _at: Date): Promise<void> {
    await runWebappNamedRoot(
      getWebappSqlDb(),
      'app.auth_login_token_mark_session_issued(text)',
      [tokenHash],
      sql`SELECT app.auth_login_token_mark_session_issued(${tokenHash}) AS marked`,
    );
  },
};
