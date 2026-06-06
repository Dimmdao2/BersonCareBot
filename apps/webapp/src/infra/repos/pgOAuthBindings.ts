/** Wave 3 phase 15B — domain SQL via `runWebappPgText`. */
import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { OauthProvider, OAuthBindingsPort } from "@/modules/auth/oauthBindingsPort";

const ALLOWED_PROVIDERS: OauthProvider[] = ["google", "apple", "yandex"];

export const pgOAuthBindingsPort: OAuthBindingsPort = {
  async listProvidersForUser(userId: string): Promise<OauthProvider[]> {
    const res = await runWebappPgText<{ provider: string }>(
      `SELECT DISTINCT provider FROM user_oauth_bindings WHERE user_id = $1`,
      [userId],
    );
    const out: OauthProvider[] = [];
    for (const row of res.rows) {
      if (ALLOWED_PROVIDERS.includes(row.provider as OauthProvider)) {
        out.push(row.provider as OauthProvider);
      }
    }
    return out;
  },

  async findUserByOAuthId(provider: OauthProvider, providerUserId: string): Promise<{ userId: string } | null> {
    const res = await runWebappPgText<{ user_id: string }>(
      `SELECT user_id FROM user_oauth_bindings WHERE provider = $1 AND provider_user_id = $2 LIMIT 1`,
      [provider, providerUserId],
    );
    const row = res.rows[0];
    return row ? { userId: row.user_id } : null;
  },
};
