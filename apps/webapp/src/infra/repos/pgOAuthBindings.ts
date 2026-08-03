/** Wave 3 phase 15B — domain SQL via `runWebappPgText`. */
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type { OauthProvider, OAuthBindingsPort } from '@/modules/auth/oauthBindingsPort';

const ALLOWED_PROVIDERS: OauthProvider[] = ['google', 'apple', 'yandex', 'vk'];

export const pgOAuthBindingsPort: OAuthBindingsPort = {
  async listProvidersForUser(userId: string): Promise<OauthProvider[]> {
    const res = await runWebappPgText<{ provider: string }>(
      `SELECT provider FROM app.auth_oauth_list_user_providers($1::uuid)`,
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

  async findUserByOAuthId(
    provider: OauthProvider,
    providerUserId: string,
  ): Promise<{ userId: string } | null> {
    const res = await runWebappPgText<{ user_id: string }>(
      `SELECT user_id::text AS user_id
       FROM app.auth_oauth_find_user($1::text, $2::text)`,
      [provider, providerUserId],
    );
    const row = res.rows[0];
    return row ? { userId: row.user_id } : null;
  },
};
