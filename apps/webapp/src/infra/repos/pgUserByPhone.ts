import type { PoolClient } from 'pg';
import { eq, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipalPlatformUserId,
  runWithDbOrganizationPrincipal,
} from '@bersoncare/db-principal';
import { platformUsers } from '../../../db/schema/schema';
/**
 * Wave 3 phase 12B + R0/S3Q — create/bind transaction checkout goes through `withPoolTransaction`.
 * Domain SQL — `runIdentityClientPgText` / `runIdentityPoolPgText`; row-shape — Zod in `identityPhoneRowSchemas`.
 */
import { getPool } from '@/infra/db/client';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { withPoolTransaction } from '@/infra/db/withClient';
import type { SessionUser } from '@/shared/types/session';
import type { ChannelContext } from '@/modules/auth/channelContext';
import type {
  UserByPhonePort,
  CreateOrBindOptions,
  CreateOrBindResult,
} from '@/modules/auth/userByPhonePort';
import { channelToBindingKey } from '@/modules/auth/channelContext';
import { normalizeRuPhoneE164 } from '@/shared/phone/normalizeRuPhoneE164';
import {
  findCanonicalUserIdByPhone,
  resolveCanonicalUserId,
} from '@/infra/repos/pgCanonicalPlatformUser';
import {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
  enrichPickMergeCandidatesWithBookingCounts,
} from '@/infra/repos/pgPlatformUserMerge';
import { upsertBroadcastDefaultsAfterChannelBind } from '@/infra/upsertBroadcastDefaultsAfterChannelBind';
import { applyPlatformUserPhoneHistoryTransition } from '@/infra/repos/pgPhoneHistory';
import {
  MergeConflictError,
  MergeDependentConflictError,
} from '@/infra/repos/platformUserMergeErrors';
import {
  isTrustedPatientPhoneActivation,
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from '@/modules/platform-access/trustedPhonePolicy';
import {
  bindingsFromRows,
  emailVerifiedRowSchema,
  lockedBindingUserIdFromAccessorRow,
  parseChannelContext,
  parseIdentityRow,
  parseUserRole,
  phoneOnlyRowSchema,
  platformUserInsertRowSchema,
  platformUserPhoneRoleRowSchema,
  platformUserSessionRowSchema,
  puMergeRowSchema,
  sessionIdentityContactsFromRows,
} from '@/infra/repos/identityPhoneRowSchemas';
import { runIdentityClientPgText, runIdentityPoolPgText } from '@/infra/repos/identityPhoneSql';
import { getWebappSqlDb, getWebappSqlFromPgClient } from '@/infra/db/runWebappSql';
import { syncUserContactsMirrorWebapp } from '@/infra/repos/userContactsSql';
import {
  FIO,
  syncUserIdentityFioMirrorWebapp,
  USER_IDENTITY_FIO_JOIN,
} from '@/infra/repos/userIdentityFioSql';

async function markPatientPhoneTrusted(client: PoolClient, userId: string): Promise<void> {
  const db = getWebappSqlFromPgClient(client);
  await db
    .update(platformUsers)
    .set({
      patientPhoneTrustAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(platformUsers.id, userId));
}

async function loadPuRowForMerge(client: PoolClient, id: string) {
  const r = await runIdentityClientPgText(
    client,
    `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, merged_into_id,
            display_name, first_name, last_name, email, created_at
     FROM platform_users WHERE id = $1`,
    [id],
  );
  return r.rows[0] ? parseIdentityRow(puMergeRowSchema, r.rows[0], 'pu_merge_row') : null;
}

/**
 * Loads the session-shaped identity for a `platform_users` row — the ONE place in this file that
 * assembles a `SessionUser` from raw columns (D15b/3: previously duplicated between this function
 * and a second inline builder inside `findByUserId`). `includeSecurityFactor` adds the staff-MFA
 * join that only the exact-id post-verification path (`findByUserId`) is allowed to attach.
 * `onMissingRow` preserves each original caller's own behavior for the (rare, racy) case where the
 * row disappears between canonical-resolve and select: `findByPhone`/`createOrBind` used to throw,
 * `findByUserId` used to return `null`.
 *
 * Returns `null` when the row is ARCHIVED (D2, 2026-07-26). Archiving must not merely gate future
 * UI — it must end the session. This is what refuses to produce a `SessionUser` for an archived
 * row, so no caller can resolve an existing session for one and no caller can mint a new one; the
 * archive writer's epoch bump kills the cookies that already exist, and this check is what makes
 * it hold on EVERY subsequent request.
 */
export async function loadSessionIdentityUser(
  userId: string,
  options: { includeSecurityFactor?: boolean; onMissingRow?: 'throw' | 'null' } = {},
): Promise<SessionUser | null> {
  const canonicalId = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
  const userRow = await runIdentityPoolPgText(
    options.includeSecurityFactor
      ? `SELECT pu.id,
                ${FIO.displayName} AS display_name,
                ${FIO.firstName} AS first_name,
                ${FIO.lastName} AS last_name,
                ${FIO.patronymic} AS patronymic,
                pu.role,
                pu.session_epoch,
                COALESCE(pu.is_archived, false) AS is_archived,
                COALESCE(sss.factor_required, false) AS security_factor_required
         FROM platform_users pu
         ${USER_IDENTITY_FIO_JOIN}
         LEFT JOIN LATERAL app.get_staff_security_session_state() sss ON true
         WHERE pu.id = $1`
      : `SELECT pu.id,
                ${FIO.displayName} AS display_name,
                ${FIO.firstName} AS first_name,
                ${FIO.lastName} AS last_name,
                ${FIO.patronymic} AS patronymic,
                pu.role,
                pu.session_epoch,
                COALESCE(pu.is_archived, false) AS is_archived
         FROM platform_users pu
         ${USER_IDENTITY_FIO_JOIN}
         WHERE pu.id = $1`,
    [canonicalId],
  );
  if (userRow.rows.length === 0) {
    if (options.onMissingRow === 'null') return null;
    throw new Error(`loadSessionUser: user ${userId} missing after canonical resolve`);
  }
  const u = parseIdentityRow(platformUserSessionRowSchema, userRow.rows[0], 'load_session_user');
  if (u.is_archived) return null;
  const firstName = u.first_name?.trim() || undefined;
  const lastName = u.last_name?.trim() || undefined;
  const patronymic = u.patronymic?.trim() || undefined;
  const bindingsRows = await runIdentityPoolPgText(
    'SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1',
    [canonicalId],
  );
  const bindings = bindingsFromRows(bindingsRows.rows);
  const contactRows = await runIdentityPoolPgText(
    `SELECT contact_kind, value_normalized, is_primary, confirmed_at, source_origin
     FROM user_contacts
     WHERE platform_user_id = $1
     ORDER BY contact_kind, is_primary DESC, created_at, id`,
    [canonicalId],
  );
  const contacts = sessionIdentityContactsFromRows(contactRows.rows);
  const phone = contacts.find((contact) => contact.kind === 'phone' && contact.isPrimary)?.value;
  const email = contacts.find((contact) => contact.kind === 'email' && contact.isPrimary)?.value;
  return {
    userId: canonicalId,
    role: parseUserRole(u.role, 'load_session_user.role'),
    displayName: u.display_name ?? '',
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(patronymic ? { patronymic } : {}),
    contacts,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    bindings,
    sessionEpoch: u.session_epoch,
    ...(options.includeSecurityFactor
      ? { securityFactorRequired: u.security_factor_required }
      : {}),
  };
}

export const pgUserByPhonePort: UserByPhonePort = {
  async getPhoneByUserId(userId: string): Promise<string | null> {
    const pool = getPool();
    const canonical = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
    const res = await runIdentityPoolPgText(
      'SELECT phone_normalized FROM platform_users WHERE id = $1',
      [canonical],
    );
    const p = res.rows[0]
      ? parseIdentityRow(phoneOnlyRowSchema, res.rows[0], 'get_phone').phone_normalized
      : null;
    return typeof p === 'string' && p.trim() ? p : null;
  },

  async getVerifiedEmailForUser(userId: string): Promise<string | null> {
    const pool = getPool();
    const canonical = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
    const res = await runIdentityPoolPgText(
      'SELECT email FROM platform_users WHERE id = $1 AND email_verified_at IS NOT NULL',
      [canonical],
    );
    const e = res.rows[0]
      ? parseIdentityRow(emailVerifiedRowSchema, res.rows[0], 'verified_email').email
      : null;
    return typeof e === 'string' && e.trim() ? e.trim() : null;
  },

  async isPhoneTrustedForUser(userId: string): Promise<boolean> {
    const rows = await getDrizzle()
      .select({
        phoneNormalized: platformUsers.phoneNormalized,
        patientPhoneTrustAt: platformUsers.patientPhoneTrustAt,
      })
      .from(platformUsers)
      .where(eq(platformUsers.id, userId))
      .limit(1);
    const row = rows[0];
    return row
      ? isTrustedPatientPhoneActivation({
          phone_normalized: row.phoneNormalized,
          patient_phone_trust_at: row.patientPhoneTrustAt,
        })
      : false;
  },

  async findByUserId(userId: string): Promise<SessionUser | null> {
    const canonicalId = await resolveCanonicalUserId(getWebappSqlDb(), userId);
    if (!canonicalId) return null;
    if (getCurrentDbPrincipalPlatformUserId() !== canonicalId) {
      throw new Error('session_user_identity_self_principal_mismatch');
    }
    // D2 (2026-07-26): an archived identity has no session, on every request. Returning `null` here
    // rather than carrying an `isArchived` flag on SessionUser is deliberate — every caller of this
    // method is an auth path (session resolution or session minting), and `null` already means
    // "there is no session identity" to all of them, so the check cannot be forgotten downstream
    // and no stale copy of the flag can ever travel in a cookie.
    return loadSessionIdentityUser(canonicalId, {
      includeSecurityFactor: true,
      onMissingRow: 'null',
    });
  },

  /**
   * C-1 (2026-07-26): increments `platform_users.session_epoch` for the caller's OWN row, which
   * kills every session minted with the previous value. Must run under the identity-self principal
   * (`app-layer/principal/staffSecuritySelfPrincipal.ts` — `enterStaffSecuritySelfPrincipal` /
   * `runWithStaffSecuritySelfPrincipal`), exactly like `findByUserId` above; the DB function reads
   * that same principal via `app.require_staff_security_self_user_id()` and raises if it is missing.
   *
   * Used by logout, password reset and "sign out everywhere" — all self-operations, and all of them
   * previously unable to revoke anything: logout never touched the DB at all, and the other two went
   * through the staff-only `app.revoke_staff_sessions()`, which raises `staff_security_profile_missing`
   * for any user without an MFA enrollment row (every current TEST user).
   */
  async invalidateSessionsForSelf(): Promise<void> {
    await runIdentityPoolPgText('SELECT app.bump_platform_user_session_epoch_self()');
  },

  async findByPhone(normalizedPhone: string): Promise<SessionUser | null> {
    const canonicalId = await findCanonicalUserIdByPhone(getWebappSqlDb(), normalizedPhone);
    if (!canonicalId) return null;
    // Phone lookup is not authentication proof. Do not read identity-self staff-security
    // state here; only the exact-id post-verification path may attach it to a session user.
    return loadSessionIdentityUser(canonicalId);
  },

  async createOrBind(
    phone: string,
    context: ChannelContext,
    options?: CreateOrBindOptions,
  ): Promise<CreateOrBindResult> {
    const parsedContext = parseChannelContext(context);
    const normalized = normalizeRuPhoneE164(phone);
    const pool = getPool();
    const key = channelToBindingKey(parsedContext.channel);
    const channelCode = parsedContext.channel;

    const bindInTransaction = () =>
      withPoolTransaction(pool, async (client) => {
        await runIdentityClientPgText(
          client,
          `SET CONSTRAINTS platform_users_integrator_user_id_key DEFERRED`,
        );

        const bindingLock = await runIdentityClientPgText(
          client,
          `SELECT app.auth_phone_bind_lock_channel_binding($1, $2) AS user_id`,
          [channelCode, parsedContext.chatId],
        );

        // Accessor always returns one row; null user_id means no binding (unlike table SELECT).
        const lockedBindingUserId = lockedBindingUserIdFromAccessorRow(bindingLock.rows[0]);
        if (lockedBindingUserId) {
          let userId =
            (await resolveCanonicalUserId(getWebappSqlFromPgClient(client), lockedBindingUserId)) ??
            lockedBindingUserId;
          const displayName = parsedContext.displayName ?? normalized;
          await runIdentityClientPgText(
            client,
            `UPDATE platform_users
           SET display_name = CASE
                 WHEN first_name IS NOT NULL OR last_name IS NOT NULL OR patronymic IS NOT NULL
                   THEN display_name
                 WHEN $1::text IS NOT NULL AND trim($1::text) <> '' THEN $1::text
                 ELSE display_name
               END,
               updated_at = now()
           WHERE id = $2`,
            [displayName, userId],
          );
          await syncUserIdentityFioMirrorWebapp(client, userId);
          await syncUserContactsMirrorWebapp(client, userId);
          if (options?.phoneNumberProven === true) {
            trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OtpCreateOrBind);
            await markPatientPhoneTrusted(client, userId);
          }
          return { userId, wasCreated: false };
        }

        const phoneRow = await runIdentityClientPgText(
          client,
          `SELECT id, display_name, role FROM platform_users
         WHERE phone_normalized = $1 AND merged_into_id IS NULL
         FOR UPDATE`,
          [normalized],
        );

        let userId: string;
        let wasCreated = false;
        const requestedProfileId = options?.profileBindUserId?.trim() || null;
        const canonicalProfileId = requestedProfileId
          ? ((await resolveCanonicalUserId(getWebappSqlFromPgClient(client), requestedProfileId)) ?? requestedProfileId)
          : null;

        if (canonicalProfileId) {
          const profileRow = await runIdentityClientPgText(
            client,
            `SELECT id, display_name, role FROM platform_users
           WHERE id = $1::uuid AND merged_into_id IS NULL
           FOR UPDATE`,
            [canonicalProfileId],
          );
          if (profileRow.rows.length === 0) {
            throw new MergeConflictError('createOrBind: profile_bind user missing', [
              canonicalProfileId,
            ]);
          }
          const profile = parseIdentityRow(
            platformUserPhoneRoleRowSchema,
            profileRow.rows[0],
            'profile_bind_user',
          );
          if (profile.role !== 'client') {
            throw new MergeConflictError('createOrBind: profile_bind requires role=client', [
              canonicalProfileId,
            ]);
          }

          if (phoneRow.rows.length > 0) {
            const owner = parseIdentityRow(
              platformUserPhoneRoleRowSchema,
              phoneRow.rows[0],
              'profile_phone_owner',
            );
            const canonicalOwnerId = (await resolveCanonicalUserId(getWebappSqlFromPgClient(client), owner.id)) ?? owner.id;
            if (canonicalOwnerId !== canonicalProfileId) {
              await mergePlatformUsersInTransaction(
                client,
                canonicalProfileId,
                canonicalOwnerId,
                'phone_bind',
              );
            }
          } else {
            await runIdentityClientPgText(
              client,
              `UPDATE platform_users
             SET phone_normalized = $1, updated_at = now()
             WHERE id = $2::uuid`,
              [normalized, canonicalProfileId],
            );
            await applyPlatformUserPhoneHistoryTransition(client, {
              platformUserId: canonicalProfileId,
              newPhoneNormalized: normalized,
              source: 'otp',
              confirmingChannel: options?.confirmingChannel,
            });
          }
          userId = canonicalProfileId;
        } else if (phoneRow.rows.length > 0) {
          const u = parseIdentityRow(platformUserPhoneRoleRowSchema, phoneRow.rows[0], 'phone_row');
          userId = u.id;
          const displayName = parsedContext.displayName ?? u.display_name ?? normalized;
          await runIdentityClientPgText(
            client,
            `UPDATE platform_users
           SET display_name = CASE
                 WHEN first_name IS NOT NULL OR last_name IS NOT NULL OR patronymic IS NOT NULL
                   THEN display_name
                 WHEN $1::text IS NOT NULL AND trim($1::text) <> '' THEN $1::text
                 ELSE display_name
               END,
               updated_at = now()
           WHERE id = $2`,
            [displayName, userId],
          );
          await syncUserIdentityFioMirrorWebapp(client, userId);
          await syncUserContactsMirrorWebapp(client, userId);
        } else {
          wasCreated = true;
          const insert = await runIdentityClientPgText(
            client,
            `INSERT INTO platform_users (phone_normalized, display_name, role)
           VALUES ($1, $2, 'client') RETURNING id, display_name`,
            [normalized, parsedContext.displayName ?? normalized],
          );
          const inserted = parseIdentityRow(
            platformUserInsertRowSchema,
            insert.rows[0],
            'insert_user',
          );
          userId = inserted.id;
          await applyPlatformUserPhoneHistoryTransition(client, {
            platformUserId: userId,
            newPhoneNormalized: normalized,
            source: 'otp',
            confirmingChannel: options?.confirmingChannel,
          });
          await syncUserIdentityFioMirrorWebapp(client, userId);
          await syncUserContactsMirrorWebapp(client, userId);
        }

        if (key) {
          const insB = await runIdentityClientPgText<{
            inserted: boolean;
            user_id: string | null;
          }>(
            client,
            `SELECT inserted, owner_user_id AS user_id
           FROM app.auth_phone_bind_upsert_channel_binding($1::uuid, $2, $3)`,
            [userId, channelCode, parsedContext.chatId],
          );
          const bindOutcome = insB.rows[0];
          if (bindOutcome?.inserted === true && bindOutcome.user_id) {
            await upsertBroadcastDefaultsAfterChannelBind(getWebappSqlFromPgClient(client), userId, channelCode);
          } else {
            const other = bindOutcome?.user_id ?? null;
            if (!other) {
              throw new MergeConflictError('createOrBind: binding row missing after conflict', [
                userId,
              ]);
            }
            if (other !== userId) {
              const a = await loadPuRowForMerge(client, userId);
              const b = await loadPuRowForMerge(client, other);
              if (!a || !b)
                throw new MergeConflictError('createOrBind: row load failed', [userId, other]);
              const [ea, eb] = await enrichPickMergeCandidatesWithBookingCounts(client, a, b);
              const { target, duplicate } = pickMergeTargetId(ea, eb);
              try {
                await mergePlatformUsersInTransaction(client, target, duplicate, 'phone_bind');
              } catch (e) {
                if (e instanceof MergeDependentConflictError || e instanceof MergeConflictError)
                  throw e;
                throw e;
              }
              userId = target;
            }
          }
        }

        if (options?.phoneNumberProven === true) {
          trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OtpCreateOrBind);
          await markPatientPhoneTrusted(client, userId);
        }
        return { userId, wasCreated };
      });

    const profileBindOrganizationId = options?.profileBindOrganizationId?.trim();
    const bound = profileBindOrganizationId
      ? await runWithDbOrganizationPrincipal(profileBindOrganizationId, bindInTransaction)
      : await bindInTransaction();

    const user = await loadSessionIdentityUser(bound.userId);
    if (!user) {
      // Archived (D2): binding a channel must not resurrect an archived identity into a session.
      throw new Error('createOrBind: platform user is archived');
    }
    return { user, wasCreated: bound.wasCreated };
  },
};
