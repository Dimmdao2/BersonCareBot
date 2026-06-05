import { getPool } from "@/infra/db/client";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { findCanonicalUserIdByPhone, resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import type {
  CreateOAuthPlatformUserInput,
  OAuthUserResolvePort,
  UpsertOAuthBindingInput,
  UpsertOAuthBindingResult,
} from "@/modules/auth/oauthUserResolvePort";

async function applyVerifiedOAuthEmail(
  userId: string,
  emailRaw: string | null,
  emailTrusted: boolean,
): Promise<void> {
  if (!emailTrusted || !emailRaw?.trim()) return;
  await runWebappPgText(
    `UPDATE platform_users
     SET email = $2::text,
         email_normalized = lower(btrim($2::text)),
         email_verified_at = COALESCE(email_verified_at, now()),
         updated_at = now()
     WHERE id = $1::uuid AND merged_into_id IS NULL`,
    [userId, emailRaw.trim()],
  );
}

async function findUserIdsByVerifiedEmail(emailNorm: string): Promise<string[]> {
  const byEmail = await runWebappPgText<{ id: string }>(
    `SELECT id FROM platform_users
     WHERE merged_into_id IS NULL
       AND email_verified_at IS NOT NULL
       AND (
         email_normalized = $1
         OR (email_normalized IS NULL AND lower(trim(COALESCE(email, ''))) = $1)
       )
     LIMIT 4`,
    [emailNorm],
  );
  return byEmail.rows.map((row) => row.id);
}

async function createOAuthPlatformUser(input: CreateOAuthPlatformUserInput): Promise<string> {
  const ins = await runWebappPgText<{ id: string }>(
    `INSERT INTO platform_users (
       phone_normalized, display_name, email, email_normalized, email_verified_at, role, patient_phone_trust_at
     )
     VALUES (
       $1, $2, $3,
       CASE
         WHEN $4::timestamptz IS NOT NULL AND COALESCE(btrim($3::text), '') <> ''
           THEN lower(btrim($3::text))
         ELSE NULL
       END,
       $4, 'client',
       CASE WHEN $1::text IS NOT NULL AND trim($1::text) <> '' THEN now() ELSE NULL END
     )
     RETURNING id`,
    [input.phoneNorm, input.display, input.emailRaw, input.emailVerifiedAt],
  );
  return ins.rows[0]!.id;
}

async function upsertOAuthBinding(input: UpsertOAuthBindingInput): Promise<UpsertOAuthBindingResult> {
  const bind = await runWebappPgText<{ user_id: string }>(
    `INSERT INTO user_oauth_bindings (user_id, provider, provider_user_id, email)
     VALUES ($1::uuid, $2::text, $3, $4)
     ON CONFLICT (provider, provider_user_id) DO NOTHING
     RETURNING user_id`,
    [input.userId, input.provider, input.providerUserId, input.emailRaw],
  );
  if ((bind.rowCount ?? 0) > 0) {
    return { inserted: true };
  }

  const existing = await runWebappPgText<{ user_id: string }>(
    `SELECT user_id::text AS user_id
     FROM user_oauth_bindings
     WHERE provider = $1::text AND provider_user_id = $2
     LIMIT 1`,
    [input.provider, input.providerUserId],
  );
  const ownerId = existing.rows[0]?.user_id;
  return ownerId ? { inserted: false, existingOwnerUserId: ownerId } : { inserted: false };
}

async function findCanonicalUserIdByPhoneNorm(phoneNorm: string): Promise<string | null> {
  const pool = getPool();
  return findCanonicalUserIdByPhone(pool, phoneNorm);
}

async function resolveCanonicalUserIdForOAuth(userId: string): Promise<string | null> {
  const pool = getPool();
  return resolveCanonicalUserId(pool, userId);
}

export const pgOAuthUserResolvePort: OAuthUserResolvePort = {
  findCanonicalUserIdByPhone: findCanonicalUserIdByPhoneNorm,
  resolveCanonicalUserId: resolveCanonicalUserIdForOAuth,
  applyVerifiedOAuthEmail,
  findUserIdsByVerifiedEmail,
  createOAuthPlatformUser,
  upsertOAuthBinding,
};
