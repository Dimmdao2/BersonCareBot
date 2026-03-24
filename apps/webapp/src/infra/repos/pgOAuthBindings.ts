import { getPool } from "@/infra/db/client";
import type { OauthProvider, OAuthBindingsPort } from "@/modules/auth/oauthBindingsPort";

export const pgOAuthBindingsPort: OAuthBindingsPort = {
  async listProvidersForUser(userId: string): Promise<OauthProvider[]> {
    const pool = getPool();
    const res = await pool.query<{ provider: string }>(
      `SELECT DISTINCT provider FROM user_oauth_bindings WHERE user_id = $1`,
      [userId]
    );
    const allowed: OauthProvider[] = ["google", "apple", "yandex"];
    const out: OauthProvider[] = [];
    for (const row of res.rows) {
      if (allowed.includes(row.provider as OauthProvider)) {
        out.push(row.provider as OauthProvider);
      }
    }
    return out;
  },
};
