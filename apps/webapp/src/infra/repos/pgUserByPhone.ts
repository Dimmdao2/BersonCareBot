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
import { resolveCanonicalUserId } from '@/infra/repos/pgCanonicalPlatformUser';
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
  preSessionMessengerChannelResolveSchema,
  preSessionPhoneConfirmResolveSchema,
  preSessionPhoneSessionLookupSchema,
  puMergeRowSchema,
  sessionIdentityContactsFromRows,
} from '@/infra/repos/identityPhoneRowSchemas';
import { runIdentityClientPgText, runIdentityPoolPgText } from '@/infra/repos/identityPhoneSql';
import { getWebappSqlDb, getWebappSqlFromPgClient, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { mutateCanonicalUserContactsWebapp } from '@/infra/repos/userContactsSql';
import { drizzlePrimaryPhoneCol, drizzlePrimaryPhoneConfirmedAtCol } from '@/infra/repos/userContactsSql';
import {
  FIO,
  syncUserIdentityFioMirrorWebapp,
  USER_IDENTITY_FIO_JOIN,
} from '@/infra/repos/userIdentityFioSql';

async function markPatientPhoneTrusted(client: PoolClient, userId: string, phoneNormalized: string): Promise<void> {
  await mutateCanonicalUserContactsWebapp(client, userId, [{
    action: 'upsert', kind: 'phone', valueNormalized: phoneNormalized, isPrimary: true,
    confirmedAt: new Date().toISOString(), sourceOrigin: 'direct',
  }]);
}

async function loadPuRowForMerge(client: PoolClient, id: string) {
  const r = await runIdentityClientPgText(
    client,
    `SELECT pu.id,
            phone.value_normalized AS phone_normalized,
            pu.integrator_user_id::text AS integrator_user_id, pu.merged_into_id,
            pu.display_name, pu.first_name, pu.last_name, email.value_normalized AS email, pu.created_at
     FROM platform_users pu
     LEFT JOIN user_contacts phone ON phone.platform_user_id = pu.id AND phone.contact_kind = 'phone' AND phone.is_primary = true
     LEFT JOIN user_contacts email ON email.platform_user_id = pu.id AND email.contact_kind = 'email' AND email.is_primary = true
     WHERE pu.id = $1`,
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

/**
 * Assembles a `SessionUser` from the shared jsonb identity shape both pre-session phone roots
 * return (`app.pre_session_find_session_user_by_phone`'s `found: true` branch and
 * `app.pre_session_phone_confirm_resolve`'s `outcome: 'resolved'` branch) — one mapper instead of
 * two copies of the same field-by-field assembly (D15b/6).
 */
function sessionUserFromPreSessionIdentityPayload(payload: {
  id: string;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  patronymic?: string | null;
  role: string;
  session_epoch: number;
  contacts: unknown[];
  bindings: unknown[];
}): SessionUser {
  const firstName = payload.first_name?.trim() || undefined;
  const lastName = payload.last_name?.trim() || undefined;
  const patronymic = payload.patronymic?.trim() || undefined;
  const contacts = sessionIdentityContactsFromRows(payload.contacts);
  const phone = contacts.find((contact) => contact.kind === 'phone' && contact.isPrimary)?.value;
  const email = contacts.find((contact) => contact.kind === 'email' && contact.isPrimary)?.value;
  return {
    userId: payload.id,
    role: parseUserRole(payload.role, 'pre_session_phone.role'),
    displayName: payload.display_name ?? '',
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(patronymic ? { patronymic } : {}),
    contacts,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    bindings: bindingsFromRows(payload.bindings),
    sessionEpoch: payload.session_epoch,
  };
}

export const pgUserByPhonePort: UserByPhonePort = {
  async getPhoneByUserId(userId: string): Promise<string | null> {
    const pool = getPool();
    const canonical = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
    const res = await runIdentityPoolPgText(
      `SELECT value_normalized AS phone_normalized FROM user_contacts
       WHERE platform_user_id = $1::uuid AND contact_kind = 'phone' AND is_primary = true`,
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
      `SELECT uc.value_normalized AS email
       FROM user_contacts uc
       WHERE uc.platform_user_id = $1::uuid AND uc.contact_kind = 'email'
         AND uc.is_primary = true AND uc.confirmed_at IS NOT NULL`,
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
        phoneNormalized: drizzlePrimaryPhoneCol,
        patientPhoneTrustAt: drizzlePrimaryPhoneConfirmedAtCol,
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

  /**
   * D15b/6 repair: the bootstrap principal that runs `POST /api/auth/phone/start` has no unnamed
   * relation door (`portContextRuntime.ts`, `capabilities['pre_session']` purpose=relation is
   * intentionally absent) — the previous two-step implementation (`findCanonicalUserIdByPhone` +
   * `loadSessionIdentityUser`, both plain relation reads) failed with "Missing declared webapp
   * port capability: pre_session" before OTP delivery was ever attempted. One named SECURITY
   * DEFINER root now resolves the canonical holder AND assembles the full session-identity
   * payload — same shape `loadSessionIdentityUser` used to build from two follow-up relation
   * reads — so no unnamed read remains on this path. Phone lookup is not authentication proof:
   * this intentionally does not read identity-self staff-security state, exactly like the
   * relation-based implementation it replaces; only the exact-id post-verification path
   * (`findByUserId`) may attach it to a session user.
   */
  async findByPhone(normalizedPhone: string): Promise<SessionUser | null> {
    const result = await runWebappNamedRoot<{ result: unknown }>(
      getWebappSqlDb(),
      'app.pre_session_find_session_user_by_phone(text)',
      [normalizedPhone],
      sql`SELECT app.pre_session_find_session_user_by_phone(${normalizedPhone}::text) AS result`,
    );
    const payload = parseIdentityRow(
      preSessionPhoneSessionLookupSchema,
      result.rows[0]?.result,
      'pre_session_find_session_user_by_phone',
    );
    if (!payload.found) return null;
    // D2 (2026-07-26): an archived identity has no session — see loadSessionIdentityUser above.
    if (payload.is_archived) return null;
    return sessionUserFromPreSessionIdentityPayload(payload);
  },

  async createOrBind(
    phone: string,
    context: ChannelContext,
    options?: CreateOrBindOptions,
  ): Promise<CreateOrBindResult> {
    const parsedContext = parseChannelContext(context);
    const normalized = normalizeRuPhoneE164(phone);
    const key = channelToBindingKey(parsedContext.channel);
    const profileBindOrganizationId = options?.profileBindOrganizationId?.trim();

    if (!key && !profileBindOrganizationId) {
      // D15b/6 confirm-path correction: `POST /api/auth/phone/confirm` (existing-user login and
      // new-user registration) reaches this under the bootstrap principal — no channel to bind
      // (`web`) and no already-authenticated profile-bind session — so it goes through the atomic
      // `pre_session` root instead of the relation-based transaction below, which the bootstrap
      // principal has no capability for (see below for the messenger-channel branch, and
      // `runWithDbOrganizationPrincipal` below for the `profileBindOrganizationId` case — the only
      // sub-case still using that transaction, under a real, non-bootstrap principal).
      const result = await runWebappNamedRoot<{ result: unknown }>(
        getWebappSqlDb(),
        'app.pre_session_phone_confirm_resolve(text,text,boolean,text)',
        [
          normalized,
          parsedContext.displayName ?? null,
          options?.phoneNumberProven === true,
          options?.confirmingChannel ?? null,
        ],
        sql`SELECT app.pre_session_phone_confirm_resolve(
          ${normalized}::text,
          ${parsedContext.displayName ?? null}::text,
          ${options?.phoneNumberProven === true}::boolean,
          ${options?.confirmingChannel ?? null}::text
        ) AS result`,
      );
      const payload = parseIdentityRow(
        preSessionPhoneConfirmResolveSchema,
        result.rows[0]?.result,
        'pre_session_phone_confirm_resolve',
      );
      if (payload.outcome === 'conflict') {
        // Same fail-closed doctrine as `app.resolve_public_booking_client_by_phone`: an ambiguous
        // live duplicate is not guessed at here — a genuine merge decision belongs to an
        // authenticated/manual flow, not an anonymous OTP confirm.
        throw new MergeConflictError('createOrBind: ambiguous live phone holders');
      }
      // D2 (2026-07-26): an archived identity has no session — see loadSessionIdentityUser above.
      if (payload.is_archived) {
        throw new Error('createOrBind: platform user is archived');
      }
      return {
        user: sessionUserFromPreSessionIdentityPayload(payload),
        wasCreated: payload.was_created,
      };
    }

    if (key && !profileBindOrganizationId) {
      // D15b/6 messenger confirm-path correction: `POST /api/auth/phone/messenger-bind/finish`'s
      // `confirmPhoneAuth` reaches this with a messenger channel key under the same bootstrap
      // principal as the plain-phone branch above — the channel binding was already established
      // pre-OTP (`applyMessengerContactPreOtpImpl` → `app.pre_session_messenger_channel_resolve`),
      // so this call re-resolves the SAME channel binding to refresh the now-OTP-proven phone
      // contact and mint a session, atomically, under the same named root — never the relation-based
      // transaction below, which the bootstrap principal has no capability for. Keyed by the channel
      // binding (not just the phone), so it never risks a duplicate identity for an already
      // channel-bound holder — see the migration header for the channel/phone-owner conflict
      // doctrine this root fails closed on instead of re-deriving the merge decision.
      const sessionUserId = options?.profileBindUserId?.trim() || null;
      const result = await runWebappNamedRoot<{ result: unknown }>(
        getWebappSqlDb(),
        'app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)',
        [
          parsedContext.channel,
          parsedContext.chatId,
          normalized,
          parsedContext.displayName ?? null,
          options?.confirmingChannel ?? null,
          sessionUserId,
        ],
        sql`SELECT app.pre_session_messenger_channel_resolve(
          ${parsedContext.channel}::text,
          ${parsedContext.chatId}::text,
          ${normalized}::text,
          ${parsedContext.displayName ?? null}::text,
          ${options?.confirmingChannel ?? null}::text,
          ${sessionUserId}::uuid
        ) AS result`,
      );
      const payload = parseIdentityRow(
        preSessionMessengerChannelResolveSchema,
        result.rows[0]?.result,
        'pre_session_messenger_channel_resolve',
      );
      if (payload.outcome === 'conflict') {
        // Same fail-closed doctrine as the plain-phone branch above: a channel-owner/phone-owner
        // disagreement is a genuine merge decision, not a guess this anonymous OTP confirm makes.
        throw new MergeConflictError(
          'createOrBind: ambiguous messenger channel/phone holders',
          payload.candidate_ids ?? [],
        );
      }
      // D2 (2026-07-26): an archived identity has no session — see loadSessionIdentityUser above.
      if (payload.is_archived) {
        throw new Error('createOrBind: platform user is archived');
      }
      return {
        user: sessionUserFromPreSessionIdentityPayload(payload),
        wasCreated: payload.was_created,
      };
    }

    const pool = getPool();
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
          await mutateCanonicalUserContactsWebapp(client, userId, [{
            action: 'upsert', kind: 'phone', valueNormalized: normalized, isPrimary: true,
            confirmedAt: options?.phoneNumberProven === true ? new Date().toISOString() : null,
            sourceOrigin: 'direct',
          }]);
          if (options?.phoneNumberProven === true) {
            trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OtpCreateOrBind);
            await markPatientPhoneTrusted(client, userId, normalized);
          }
          return { userId, wasCreated: false };
        }

        const phoneRow = await runIdentityClientPgText(
          client,
          `SELECT pu.id, pu.display_name, pu.role FROM user_contacts uc
         JOIN platform_users pu ON pu.id = uc.platform_user_id
         WHERE uc.contact_kind = 'phone' AND uc.value_normalized = $1 AND pu.merged_into_id IS NULL
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
                { mergeContext: { channel: parsedContext.channel, source: 'otp' } },
              );
            }
          } else {
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
          await mutateCanonicalUserContactsWebapp(client, userId, [{
            action: 'upsert', kind: 'phone', valueNormalized: normalized, isPrimary: true,
            confirmedAt: options?.phoneNumberProven === true ? new Date().toISOString() : null,
            sourceOrigin: 'direct',
          }]);
        } else {
          wasCreated = true;
          const insert = await runIdentityClientPgText(
            client,
            `INSERT INTO platform_users (display_name, role)
           VALUES ($1, 'client') RETURNING id, display_name`,
            [parsedContext.displayName ?? normalized],
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
          await mutateCanonicalUserContactsWebapp(client, userId, [{
            action: 'upsert', kind: 'phone', valueNormalized: normalized, isPrimary: true,
            confirmedAt: options?.phoneNumberProven === true ? new Date().toISOString() : null,
            sourceOrigin: 'direct',
          }]);
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
                await mergePlatformUsersInTransaction(client, target, duplicate, 'phone_bind', {
                  mergeContext: { channel: parsedContext.channel, source: 'otp' },
                });
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
          await markPatientPhoneTrusted(client, userId, normalized);
        }
        return { userId, wasCreated };
      });

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
