import { getPool } from "@/infra/db/client";
import type { EmailPasswordLookupPort } from "@/modules/auth/emailPasswordLookup/ports";
import type { EmailPasswordAuthState } from "@/modules/auth/emailPasswordLookup/types";

export function createPgEmailPasswordLookupPort(): EmailPasswordLookupPort {
  return {
    async resolveAuthState(emailNormalized): Promise<EmailPasswordAuthState> {
      const pool = getPool();
      const r = await pool.query<{
        id: string;
        email_verified: boolean;
        has_password: boolean;
      }>(
        `SELECT pu.id::text AS id,
                (pu.email_verified_at IS NOT NULL) AS email_verified,
                EXISTS (
                  SELECT 1 FROM user_password_credentials upc WHERE upc.user_id = pu.id
                ) AS has_password
         FROM platform_users pu
         WHERE pu.email_normalized = $1
           AND pu.merged_into_id IS NULL`,
        [emailNormalized],
      );

      if (r.rows.length === 0) {
        return { kind: "free" };
      }
      if (r.rows.length > 1) {
        return { kind: "email_conflict" };
      }

      const row = r.rows[0]!;
      if (row.email_verified && row.has_password) {
        return { kind: "verified_with_password", userId: row.id };
      }
      if (!row.email_verified && row.has_password) {
        return { kind: "pending_registration", userId: row.id };
      }
      return { kind: "needs_email_setup", userId: row.id };
    },
  };
}

export const inMemoryEmailPasswordLookupPort: EmailPasswordLookupPort = {
  async resolveAuthState() {
    return { kind: "free" };
  },
};
