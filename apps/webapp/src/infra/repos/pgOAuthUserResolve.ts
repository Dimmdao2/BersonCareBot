import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappSql,
} from '@/infra/db/runWebappSql';
import {
  drizzlePrimaryPhoneCol,
  syncUserContactsMirrorWebapp,
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
import { platformUsers } from '../../../db/schema/schema';

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
  const db = getWebappSqlDb();
  await db
    .update(platformUsers)
    .set({
      email,
      emailNormalized: email.toLowerCase(),
      emailVerifiedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(platformUsers.id, userId),
        isNull(platformUsers.mergedIntoId),
        isNull(platformUsers.email),
      ),
    );
  await db
    .update(platformUsers)
    .set({
      emailVerifiedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(platformUsers.id, userId),
        isNull(platformUsers.mergedIntoId),
        isNull(platformUsers.emailVerifiedAt),
        sql`lower(btrim(${platformUsers.email})) = lower(btrim(${email}::text))`,
      ),
    );
  await syncUserContactsMirrorWebapp(getWebappSqlDb(), userId);
}

async function findUserIdsByAnyConfirmedEmail(emailNorm: string): Promise<string[]> {
  const r = await runWebappSql<{ user_id: string }>(
    getWebappSqlDb(),
    sql`SELECT user_id::text AS user_id
          FROM app.find_platform_user_ids_by_any_confirmed_email(${emailNorm})`,
  );
  return r.rows.map((row) => row.user_id);
}

async function getActivePhoneForUser(userId: string): Promise<string | null> {
  const rows = await getWebappSqlDb()
    .select({ phone_normalized: drizzlePrimaryPhoneCol })
    .from(platformUsers)
    .where(and(eq(platformUsers.id, userId), isNull(platformUsers.mergedIntoId)))
    .limit(1);
  const phone = rows[0]?.phone_normalized;
  return typeof phone === 'string' && phone.trim() ? phone : null;
}

async function addSparePhoneContact(userId: string, phoneNorm: string): Promise<void> {
  const pool = getPool();
  await getWebappSqlDb()
    .update(platformUsers)
    .set({ phoneNormalized: phoneNorm, updatedAt: sql`now()` })
    .where(and(eq(platformUsers.id, userId), isNull(platformUsers.mergedIntoId)));
  await applyPlatformUserPhoneHistoryTransition(pool, {
    platformUserId: userId,
    newPhoneNormalized: phoneNorm,
    source: 'oauth',
  });
}

async function findUserIdsByVerifiedEmail(emailNorm: string): Promise<string[]> {
  const byEmail = await getWebappSqlDb()
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(
      and(
        isNull(platformUsers.mergedIntoId),
        isNotNull(platformUsers.emailVerifiedAt),
        or(
          eq(platformUsers.emailNormalized, emailNorm),
          and(
            isNull(platformUsers.emailNormalized),
            sql`lower(trim(COALESCE(${platformUsers.email}, ''))) = ${emailNorm}`,
          ),
        ),
      ),
    )
    .limit(4);
  return byEmail.map((row) => row.id);
}

async function findActiveUserIdsByEmail(emailNorm: string): Promise<string[]> {
  // Same as findUserIdsByVerifiedEmail but WITHOUT the email_verified_at filter — mirrors the
  // uq_user_contacts_email uniqueness so we link instead of INSERT-colliding.
  const byEmail = await getWebappSqlDb()
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(
      and(
        isNull(platformUsers.mergedIntoId),
        or(
          eq(platformUsers.emailNormalized, emailNorm),
          and(
            isNull(platformUsers.emailNormalized),
            sql`lower(trim(COALESCE(${platformUsers.email}, ''))) = ${emailNorm}`,
          ),
        ),
      ),
    )
    .limit(4);
  return byEmail.map((row) => row.id);
}

async function createOAuthPlatformUser(input: CreateOAuthPlatformUserInput): Promise<string> {
  const emailTrimmed = input.emailRaw?.trim() ?? '';
  const hasVerifiedEmail = input.emailVerifiedAt != null && emailTrimmed !== '';
  const phoneTrimmed = input.phoneNorm?.trim() ?? '';
  const hasPhone = phoneTrimmed !== '';
  const rows = await getWebappSqlDb()
    .insert(platformUsers)
    .values({
      phoneNormalized: input.phoneNorm,
      displayName: input.display,
      email: input.emailRaw,
      emailNormalized: hasVerifiedEmail ? emailTrimmed.toLowerCase() : null,
      emailVerifiedAt: input.emailVerifiedAt?.toISOString() ?? null,
      role: 'client',
      patientPhoneTrustAt: hasPhone ? sql`now()` : null,
    })
    .returning({ id: platformUsers.id });
  const userId = rows[0]!.id;
  await syncUserIdentityFioMirrorWebapp(getWebappSqlDb(), userId);
  await syncUserContactsMirrorWebapp(getWebappSqlDb(), userId);
  return userId;
}

async function upsertOAuthBinding(
  input: UpsertOAuthBindingInput,
): Promise<UpsertOAuthBindingResult> {
  const bind = await runWebappNamedRoot<{ inserted: boolean; user_id: string }>(
    getWebappSqlDb(),
    'app.auth_oauth_upsert_binding(uuid,text,text,text)',
    [input.userId, input.provider, input.providerUserId, input.emailRaw],
    sql`SELECT inserted, user_id::text AS user_id
          FROM app.auth_oauth_upsert_binding(
            ${input.userId}::uuid,
            ${input.provider},
            ${input.providerUserId},
            ${input.emailRaw}
          )`,
  );
  const row = bind.rows[0];
  if (row?.inserted === true) {
    await syncUserContactsMirrorWebapp(getWebappSqlDb(), input.userId);
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
