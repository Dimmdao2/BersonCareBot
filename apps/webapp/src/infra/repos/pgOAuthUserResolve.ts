import { getPool } from '@/infra/db/client';
import { getWebappSqlDb, runWebappPgText } from '@/infra/db/runWebappSql';
import {
  CONTACTS,
  syncUserContactsMirrorWebapp,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
} from '@/infra/repos/userContactsSql';
import { syncUserIdentityFioMirrorWebapp } from '@/infra/repos/userIdentityFioSql';
import {
  findCanonicalUserIdByPhone,
  resolveCanonicalUserId,
} from '@/infra/repos/pgCanonicalPlatformUser';
import { applyPlatformUserPhoneHistoryTransition } from '@/infra/repos/pgPhoneHistory';
import type {
  CreateOAuthPlatformUserInput,
  OAuthUserResolvePort,
  UpsertOAuthBindingInput,
  UpsertOAuthBindingResult,
} from '@/modules/auth/oauthUserResolvePort';

/**
 * IDENTITY_AND_MERGE_SCHEME.md §2a (owner, 03.08): "убрать перезапись основной почты при входе
 * через OAuth" — the primary is set once, from whichever verified email arrives first (OTP,
 * registration, or an earlier OAuth sign-in), and never reassigned by a later OAuth sign-in.
 * The `email IS NULL` guard on the first UPDATE is that fix: a later, DIFFERENT provider address
 * is still recorded, just as a confirmed secondary via `upsertOAuthBinding`'s `user_oauth_bindings`
 * row, not here.
 *
 * §2a case 1 separately requires that an OAuth sign-in confirms an address the account already
 * holds ("успешный OAuth-вход является подтверждением адреса наравне с кодом") — e.g. someone
 * registered by email+password and never finished the verification challenge. The second UPDATE
 * below covers exactly that: it only ever touches `email_verified_at`, never the primary email
 * value, so it cannot reassign the primary (F5 stays intact) and is idempotent (no-op once
 * already verified).
 */
async function applyVerifiedOAuthEmail(
  userId: string,
  emailRaw: string | null,
  emailTrusted: boolean,
): Promise<void> {
  if (!emailTrusted || !emailRaw?.trim()) return;
  const email = emailRaw.trim();
  await runWebappPgText(
    `UPDATE platform_users
     SET email = $2::text,
         email_normalized = lower(btrim($2::text)),
         email_verified_at = now(),
         updated_at = now()
     WHERE id = $1::uuid AND merged_into_id IS NULL AND email IS NULL`,
    [userId, email],
  );
  await runWebappPgText(
    `UPDATE platform_users
     SET email_verified_at = now(),
         updated_at = now()
     WHERE id = $1::uuid AND merged_into_id IS NULL
       AND email_verified_at IS NULL
       AND lower(btrim(email)) = lower(btrim($2::text))`,
    [userId, email],
  );
  await syncUserContactsMirrorWebapp(getPool(), userId);
}

async function findUserIdsByAnyConfirmedEmail(emailNorm: string): Promise<string[]> {
  const r = await runWebappPgText<{ user_id: string }>(
    `SELECT user_id::text AS user_id
     FROM app.find_platform_user_ids_by_any_confirmed_email($1)`,
    [emailNorm],
  );
  return r.rows.map((row) => row.user_id);
}

async function getActivePhoneForUser(userId: string): Promise<string | null> {
  const r = await runWebappPgText<{ phone_normalized: string | null }>(
    `SELECT ${CONTACTS.phoneNormalized} AS phone_normalized
     FROM platform_users pu
     ${USER_CONTACTS_PRIMARY_PHONE_LATERAL}
     WHERE pu.id = $1::uuid AND pu.merged_into_id IS NULL`,
    [userId],
  );
  const phone = r.rows[0]?.phone_normalized;
  return typeof phone === 'string' && phone.trim() ? phone : null;
}

async function addSparePhoneContact(userId: string, phoneNorm: string): Promise<void> {
  const pool = getPool();
  await runWebappPgText(
    `UPDATE platform_users SET phone_normalized = $2::text, updated_at = now()
     WHERE id = $1::uuid AND merged_into_id IS NULL`,
    [userId, phoneNorm],
  );
  await applyPlatformUserPhoneHistoryTransition(pool, {
    platformUserId: userId,
    newPhoneNormalized: phoneNorm,
    source: 'oauth',
  });
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

async function findActiveUserIdsByEmail(emailNorm: string): Promise<string[]> {
  // Same as findUserIdsByVerifiedEmail but WITHOUT the email_verified_at filter — mirrors the
  // uq_user_contacts_email uniqueness so we link instead of INSERT-colliding.
  const byEmail = await runWebappPgText<{ id: string }>(
    `SELECT id FROM platform_users
     WHERE merged_into_id IS NULL
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
  const userId = ins.rows[0]!.id;
  await syncUserIdentityFioMirrorWebapp(getPool(), userId);
  await syncUserContactsMirrorWebapp(getPool(), userId);
  return userId;
}

async function upsertOAuthBinding(
  input: UpsertOAuthBindingInput,
): Promise<UpsertOAuthBindingResult> {
  const bind = await runWebappPgText<{ inserted: boolean; user_id: string }>(
    `SELECT inserted, user_id::text AS user_id
     FROM app.auth_oauth_upsert_binding($1::uuid, $2::text, $3::text, $4::text)`,
    [input.userId, input.provider, input.providerUserId, input.emailRaw],
  );
  const row = bind.rows[0];
  if (row?.inserted === true) {
    await syncUserContactsMirrorWebapp(getPool(), input.userId);
    return { inserted: true };
  }
  const ownerId = row?.user_id;
  return ownerId ? { inserted: false, existingOwnerUserId: ownerId } : { inserted: false };
}

async function findCanonicalUserIdByPhoneNorm(phoneNorm: string): Promise<string | null> {
  return findCanonicalUserIdByPhone(getWebappSqlDb(), phoneNorm);
}

async function resolveCanonicalUserIdForOAuth(userId: string): Promise<string | null> {
  return resolveCanonicalUserId(getWebappSqlDb(), userId);
}

export const pgOAuthUserResolvePort: OAuthUserResolvePort = {
  findCanonicalUserIdByPhone: findCanonicalUserIdByPhoneNorm,
  resolveCanonicalUserId: resolveCanonicalUserIdForOAuth,
  applyVerifiedOAuthEmail,
  findUserIdsByVerifiedEmail,
  findActiveUserIdsByEmail,
  findUserIdsByAnyConfirmedEmail,
  getActivePhoneForUser,
  addSparePhoneContact,
  createOAuthPlatformUser,
  upsertOAuthBinding,
};
