import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type { OAuthBindingsPort } from "@/modules/auth/oauthBindingsPort";

export type YandexOAuthResolveFailure =
  | "no_identity"      // Яндекс не вернул ни телефон, ни email
  | "email_ambiguous"
  | "db_error";

/**
 * Резолвит пользователя для Yandex OAuth:
 * 1. Существующая OAuth-привязка по yandexId
 * 2. Merge по phone_normalized (если Яндекс вернул телефон)
 * 3. Fallback merge по verified email
 * 4. Создание нового пользователя
 * Если нет ни телефона, ни email — возвращает `no_identity`.
 */
export async function resolveUserIdForYandexOAuth(
  oauthPort: OAuthBindingsPort,
  input: { yandexId: string; email: string | null; displayName: string | null; phone: string | null },
): Promise<{ ok: true; userId: string } | { ok: false; reason: YandexOAuthResolveFailure }> {
  const emailRaw = input.email?.trim() || null;
  const emailNorm = emailRaw ? emailRaw.toLowerCase() : null;
  const phoneRaw = input.phone?.trim() || null;
  const phoneNorm = phoneRaw ? normalizeRuPhoneE164(phoneRaw) : null;

  if (!phoneNorm && !emailNorm) {
    return { ok: false, reason: "no_identity" };
  }

  const byOAuth = await oauthPort.findUserByOAuthId("yandex", input.yandexId);
  if (byOAuth) {
    return { ok: true, userId: byOAuth.userId };
  }

  if (!env.DATABASE_URL?.trim()) {
    return { ok: false, reason: "db_error" };
  }

  const pool = getPool();

  try {
    let userId: string | null = null;

    // Merge по phone_normalized (приоритет)
    if (phoneNorm) {
      const byPhone = await pool.query<{ id: string }>(
        `SELECT id FROM platform_users WHERE phone_normalized = $1 LIMIT 1`,
        [phoneNorm],
      );
      if (byPhone.rows.length === 1) {
        userId = byPhone.rows[0].id;
      }
    }

    // Fallback: merge по verified email
    if (!userId && emailNorm) {
      const byEmail = await pool.query<{ id: string }>(
        `SELECT id FROM platform_users
         WHERE lower(trim(COALESCE(email, ''))) = $1 AND email_verified_at IS NOT NULL
         LIMIT 4`,
        [emailNorm],
      );
      if (byEmail.rows.length > 1) {
        return { ok: false, reason: "email_ambiguous" };
      }
      if (byEmail.rows.length === 1) {
        userId = byEmail.rows[0].id;
      }
    }

    // Создание нового пользователя
    if (!userId) {
      const display = (input.displayName?.trim() || emailRaw || phoneNorm || "").slice(0, 500);
      const emailVerifiedAt = emailRaw ? new Date() : null;
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO platform_users (phone_normalized, display_name, email, email_verified_at, role)
         VALUES ($1, $2, $3, $4, 'client')
         RETURNING id`,
        [phoneNorm, display, emailRaw, emailVerifiedAt],
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
