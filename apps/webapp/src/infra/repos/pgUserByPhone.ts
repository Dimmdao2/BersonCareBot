import type { Pool, PoolClient } from 'pg';
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
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from '@/modules/platform-access/trustedPhonePolicy';
import {
  bindingsFromRows,
  emailVerifiedRowSchema,
  parseChannelContext,
  parseIdentityRow,
  parseUserRole,
  phoneOnlyRowSchema,
  platformUserInsertRowSchema,
  platformUserPhoneRoleRowSchema,
  platformUserSessionRowSchema,
  puMergeRowSchema,
  userIdRowSchema,
} from '@/infra/repos/identityPhoneRowSchemas';
import { runIdentityClientPgText, runIdentityPoolPgText } from '@/infra/repos/identityPhoneSql';
import { getWebappSqlFromPgClient } from '@/infra/db/runWebappSql';

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
 * Loads the session-shaped identity for a `platform_users` row.
 *
 * Returns `null` when the row is ARCHIVED (D2, 2026-07-26). Archiving must not merely gate future
 * UI — it must end the session. Both loaders in this file therefore refuse to produce a
 * `SessionUser` for an archived row, so no caller can resolve an existing session for one and no
 * caller can mint a new one; the archive writer's epoch bump kills the cookies that already exist,
 * and this check is what makes it hold on EVERY subsequent request.
 */
async function loadSessionIdentityUser(pool: Pool, userId: string): Promise<SessionUser | null> {
  const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;
  const userRow = await runIdentityPoolPgText(
    `SELECT pu.id, pu.display_name, pu.first_name, pu.last_name, pu.patronymic, pu.role, pu.phone_normalized,
            pu.session_epoch,
            COALESCE(pu.is_archived, false) AS is_archived
     FROM platform_users pu
     WHERE pu.id = $1`,
    [canonicalId],
  );
  if (userRow.rows.length === 0) {
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
  return {
    userId: canonicalId,
    role: parseUserRole(u.role, 'load_session_user.role'),
    displayName: u.display_name ?? '',
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(patronymic ? { patronymic } : {}),
    phone: u.phone_normalized ?? undefined,
    bindings,
    sessionEpoch: u.session_epoch,
  };
}

export const pgUserByPhonePort: UserByPhonePort = {
  async getPhoneByUserId(userId: string): Promise<string | null> {
    const pool = getPool();
    const canonical = (await resolveCanonicalUserId(pool, userId)) ?? userId;
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
    const canonical = (await resolveCanonicalUserId(pool, userId)) ?? userId;
    const res = await runIdentityPoolPgText(
      'SELECT email FROM platform_users WHERE id = $1 AND email_verified_at IS NOT NULL',
      [canonical],
    );
    const e = res.rows[0]
      ? parseIdentityRow(emailVerifiedRowSchema, res.rows[0], 'verified_email').email
      : null;
    return typeof e === 'string' && e.trim() ? e.trim() : null;
  },

  async findByUserId(userId: string): Promise<SessionUser | null> {
    const pool = getPool();
    const canonicalId = await resolveCanonicalUserId(pool, userId);
    if (!canonicalId) return null;
    if (getCurrentDbPrincipalPlatformUserId() !== canonicalId) {
      throw new Error('session_user_identity_self_principal_mismatch');
    }
    const userRow = await runIdentityPoolPgText(
      `SELECT pu.id, pu.display_name, pu.first_name, pu.last_name, pu.patronymic, pu.role, pu.phone_normalized,
              pu.session_epoch,
              COALESCE(pu.is_archived, false) AS is_archived,
              COALESCE(sss.factor_required, false) AS security_factor_required
       FROM platform_users pu
       LEFT JOIN LATERAL app.get_staff_security_session_state() sss ON true
       WHERE pu.id = $1`,
      [canonicalId],
    );
    if (userRow.rows.length === 0) return null;
    const u = parseIdentityRow(platformUserSessionRowSchema, userRow.rows[0], 'find_by_user_id');
    // D2 (2026-07-26): an archived identity has no session, on every request. Returning `null` here
    // rather than carrying an `isArchived` flag on SessionUser is deliberate — every caller of this
    // method is an auth path (session resolution or session minting), and `null` already means
    // "there is no session identity" to all of them, so the check cannot be forgotten downstream
    // and no stale copy of the flag can ever travel in a cookie.
    if (u.is_archived) return null;
    const firstName = u.first_name?.trim() || undefined;
    const lastName = u.last_name?.trim() || undefined;
    const patronymic = u.patronymic?.trim() || undefined;
    const bindingsRows = await runIdentityPoolPgText(
      'SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1',
      [canonicalId],
    );
    const bindings = bindingsFromRows(bindingsRows.rows);
    return {
      userId: u.id,
      role: parseUserRole(u.role, 'find_by_user_id.role'),
      displayName: u.display_name ?? '',
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(patronymic ? { patronymic } : {}),
      phone: u.phone_normalized ?? undefined,
      bindings,
      sessionEpoch: u.session_epoch,
      securityFactorRequired: u.security_factor_required,
    };
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
    const pool = getPool();
    const canonicalId = await findCanonicalUserIdByPhone(pool, normalizedPhone);
    if (!canonicalId) return null;
    // Phone lookup is not authentication proof. Do not read identity-self staff-security
    // state here; only the exact-id post-verification path may attach it to a session user.
    return loadSessionIdentityUser(pool, canonicalId);
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
          `SET CONSTRAINTS platform_users_phone_normalized_key, platform_users_integrator_user_id_key DEFERRED`,
        );

        const bindingLock = await runIdentityClientPgText(
          client,
          `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE`,
          [channelCode, parsedContext.chatId],
        );

        if (bindingLock.rows.length > 0) {
          let userId = parseIdentityRow(
            userIdRowSchema,
            bindingLock.rows[0],
            'binding_lock',
          ).user_id;
          const canonicalId = (await resolveCanonicalUserId(client, userId)) ?? userId;
          userId = canonicalId;
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
          ? ((await resolveCanonicalUserId(client, requestedProfileId)) ?? requestedProfileId)
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
            const canonicalOwnerId = (await resolveCanonicalUserId(client, owner.id)) ?? owner.id;
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
          });
        }

        if (key) {
          const insB = await runIdentityClientPgText(
            client,
            `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (channel_code, external_id) DO NOTHING
           RETURNING user_id`,
            [userId, channelCode, parsedContext.chatId],
          );
          if (insB.rows.length > 0) {
            await upsertBroadcastDefaultsAfterChannelBind(client, userId, channelCode);
          } else {
            const o = await runIdentityClientPgText(
              client,
              `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE`,
              [channelCode, parsedContext.chatId],
            );
            const other = o.rows[0]
              ? parseIdentityRow(userIdRowSchema, o.rows[0], 'binding_conflict').user_id
              : null;
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

    const user = await loadSessionIdentityUser(pool, bound.userId);
    if (!user) {
      // Archived (D2): binding a channel must not resurrect an archived identity into a session.
      throw new Error('createOrBind: platform user is archived');
    }
    return { user, wasCreated: bound.wasCreated };
  },
};
