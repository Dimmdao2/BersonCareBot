import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import type { OAuthBindingsPort } from "@/modules/auth/oauthBindingsPort";

export type YandexOAuthResolveFailure =
  | "no_verified_email"
  | "email_ambiguous"
  | "db_error";

/**
 * Резолвит пользователя для Yandex OAuth: привязка → merge по verified email → новый client.
 * Без DATABASE_URL после неудачного поиска по OAuth вернёт `db_error`.
 */
export async function resolveUserIdForYandexOAuth(
  oauthPort: OAuthBindingsPort,
  input: { yandexId: string; email: string | null; displayName: string | null },
): Promise<{ ok: true; userId: string } | { ok: false; reason: YandexOAuthResolveFailure }> {
  const emailRaw = input.email?.trim();
  if (!emailRaw) {
    return { ok: false, reason: "no_verified_email" };
  }

  const emailNorm = emailRaw.toLowerCase();

  try {
    const byOAuth = await oauthPort.findUserByOAuthId("yandex", input.yandexId);
    if (byOAuth) {
      return { ok: true, userId: byOAuth.userId };
    }

    if (!env.DATABASE_URL?.trim()) {
      return { ok: false, reason: "db_error" };
    }

    const pool = getPool();

    const merged = await pool.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE lower(trim(COALESCE(email, ''))) = $1 AND email_verified_at IS NOT NULL
       LIMIT 4`,
      [emailNorm],
    );

    if (merged.rows.length > 1) {
      return { ok: false, reason: "email_ambiguous" };
    }

    let userId: string;
    if (merged.rows.length === 1) {
      userId = merged.rows[0].id;
    } else {
      const display = (input.displayName?.trim() || emailRaw).slice(0, 500);
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, email, email_verified_at, role)
         VALUES ($1, $2, now(), 'client')
         RETURNING id`,
        [display, emailRaw],
      );
      userId = ins.rows[0].id;
    }

    await pool.query(
      `INSERT INTO user_oauth_bindings (user_id, provider, provider_user_id, email)
       VALUES ($1::uuid, 'yandex', $2, $3)
       ON CONFLICT (provider, provider_user_id)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         email = COALESCE(EXCLUDED.email, user_oauth_bindings.email)`,
      [userId, input.yandexId, emailRaw],
    );

    return { ok: true, userId };
  } catch {
    return { ok: false, reason: "db_error" };
  }
}
