/** Wave 3 phase 15B — domain SQL via `runWebappPgText`. */
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { nullableToIsoStringSafe, toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type {
  EmailSetupTokenRow,
  EmailSetupTokensPort,
  IssueEmailSetupTokenParams,
} from "@/modules/auth/emailSetupTokens/ports";

export const pgEmailSetupTokensPort: EmailSetupTokensPort = {
  async revokeActiveForUserEmail(userId: string, emailNormalized: string): Promise<void> {
    await runWebappPgText(
      `SELECT app.auth_email_setup_revoke_active($1::uuid, $2::text) AS revoked_count`,
      [userId, emailNormalized],
    );
  },

  async insertToken(params: IssueEmailSetupTokenParams): Promise<{ id: string }> {
    const res = await runWebappPgText<{ id: string }>(
      `SELECT app.auth_email_setup_insert(
         $1::uuid,
         $2::text,
         $3::text,
         $4::timestamptz,
         $5::text,
         $6::uuid
       )::text AS id`,
      [
        params.userId,
        params.emailNormalized,
        params.tokenHash,
        params.expiresAtIso,
        params.source,
        params.createdByUserId ?? null,
      ],
    );
    return { id: res.rows[0]!.id };
  },

  async deleteTokenById(id: string): Promise<void> {
    await runWebappPgText(`SELECT app.auth_email_setup_delete($1::uuid) AS deleted`, [id]);
  },

  async findByTokenHash(tokenHash: string): Promise<EmailSetupTokenRow | null> {
    const res = await runWebappPgText<{
      id: string;
      user_id: string;
      email_normalized: string;
      expires_at: Date | string;
      used_at: Date | string | null;
      revoked_at: Date | string | null;
    }>(
      `SELECT id::text AS id, user_id::text AS user_id, email_normalized,
              expires_at, used_at, revoked_at
       FROM app.auth_email_setup_read($1::text)`,
      [tokenHash],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0]!;
    return {
      id: r.id,
      userId: r.user_id,
      emailNormalized: r.email_normalized,
      expiresAt: toIsoStringSafe(r.expires_at),
      usedAt: nullableToIsoStringSafe(r.used_at),
      revokedAt: nullableToIsoStringSafe(r.revoked_at),
    };
  },

  async markUsedById(id: string): Promise<boolean> {
    const res = await runWebappPgText<{ marked: boolean }>(
      `SELECT app.auth_email_setup_mark_used($1::uuid) AS marked`,
      [id],
    );
    return res.rows[0]?.marked === true;
  },
};
