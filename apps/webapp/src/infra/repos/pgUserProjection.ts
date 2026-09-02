/**
 * Wave 3 phase 14B + R0/S3R — projection transactions go through `withPoolTransaction`.
 * Domain SQL — Drizzle CRUD + `runWebappSql` for session/constraint fragments.
 */
import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import { withPoolTransaction } from '@/infra/db/withClient';
import { nullableToIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappNamedRoot,
  runWebappSql,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { MergeConflictError } from '@/infra/repos/platformUserMergeErrors';
import {
  upsertIdentityProjection,
  collapseIdentityProjectionCandidates,
} from '@bersoncare/platform-merge';
import { syncUserIdentityFioMirrorWebapp } from '@/infra/repos/userIdentityFioSql';
import {
  drizzlePrimaryPhoneCol,
  drizzlePrimaryEmailCol,
  drizzlePrimaryEmailConfirmedAtCol,
  mutateCanonicalUserContactsWebapp,
} from '@/infra/repos/userContactsSql';
import { findCanonicalUserIdByPhone } from '@/infra/repos/pgCanonicalPlatformUser';
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from '@/modules/platform-access/trustedPhonePolicy';
import type { PoolClient } from 'pg';
import { applyPlatformUserPhoneHistoryTransition } from '@/infra/repos/pgPhoneHistory';
import {
  findPlatformUserIdWithEmailConflict,
  findPlatformUserIdWithPhoneConflict,
} from '@/infra/repos/pgAdminClientProfileConflicts';
import type { UserProjectionPort } from '@/modules/identity/ports';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { platformUsers, userContacts, userNotificationTopics } from '../../../db/schema/schema';

function txExecutor(client: PoolClient): WebappSqlExecutor {
  return getWebappSqlFromPgClient(client);
}

async function txSql<T = unknown>(
  client: PoolClient,
  fragment: ReturnType<typeof sql.raw> | Parameters<typeof runWebappSql<T>>[1],
) {
  return runWebappSql<T>(txExecutor(client), fragment);
}

class PatchAdminClientProfileNoRowsError extends Error {
  constructor() {
    super('patch_admin_client_profile_no_rows');
  }
}

/**
 * Collapse duplicate canonical `platform_users` rows referenced by integrator/messenger resolution
 * (Phase B) — delegates to the shared `@bersoncare/platform-merge` cascade (D15b/2: the SAME
 * implementation the integrator's `mergeCandidateIdsViaPlatformMerge` uses, not a parallel copy).
 */
export async function mergeCanonicalPlatformUserCandidates(
  client: PoolClient,
  candidateIds: string[],
  reason: 'projection' | 'phone_bind',
): Promise<string> {
  const uniq = [...new Set(candidateIds)].filter(Boolean);
  if (uniq.length === 0) throw new MergeConflictError('mergeCandidates: empty', candidateIds);
  return collapseIdentityProjectionCandidates(client, uniq, reason);
}

export const pgUserProjectionPort: UserProjectionPort = {
  async findByPhoneNormalized(phoneNormalized) {
    const platformUserId = await findCanonicalUserIdByPhone(getWebappSqlDb(), phoneNormalized);
    return platformUserId ? { platformUserId } : null;
  },

  async updatePhone(platformUserId, phoneNormalized) {
    const pool = getPool();
    trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.IntegratorUpdatePhone);
    await withPoolTransaction(pool, async (client) => {
      await applyPlatformUserPhoneHistoryTransition(client, {
        platformUserId,
        newPhoneNormalized: phoneNormalized,
        source: 'projection',
      });
    });
  },

  async updateProfileByPhone(params) {
    if (
      params.firstName === undefined &&
      params.lastName === undefined &&
      params.email === undefined
    ) {
      return;
    }
    const pool = getPool();
    await withPoolTransaction(pool, async (client) => {
      const db = txExecutor(client);
      const updated = await db
        .update(platformUsers)
        .set({
          updatedAt: sql`now()`,
          ...(params.firstName !== undefined ? { firstName: params.firstName } : {}),
          ...(params.lastName !== undefined ? { lastName: params.lastName } : {}),
        })
        .where(
          and(
            exists(
              db
                .select({ one: sql`1` })
                .from(userContacts)
                .where(
                  and(
                    eq(userContacts.platformUserId, platformUsers.id),
                    eq(userContacts.contactKind, 'phone'),
                    eq(userContacts.valueNormalized, params.phoneNormalized),
                  ),
                ),
            ),
            isNull(platformUsers.mergedIntoId),
          ),
        )
        .returning({ id: platformUsers.id });
      for (const row of updated) {
        await syncUserIdentityFioMirrorWebapp(client, row.id);
      }
      if (params.email !== undefined) {
        for (const row of updated) {
          await mutateCanonicalUserContactsWebapp(
            client,
            row.id,
            params.email?.trim()
              ? [
                  {
                    action: 'upsert',
                    kind: 'email',
                    valueNormalized: params.email.trim().toLowerCase(),
                    isPrimary: true,
                    confirmedAt: null,
                    sourceOrigin: 'direct',
                  },
                ]
              : [{ action: 'remove', kind: 'email' }],
          );
        }
      }
    });
  },

  async upsertNotificationTopics(params) {
    const db = getWebappSqlDb();
    for (const topic of params.topics) {
      await db
        .insert(userNotificationTopics)
        .values({
          userId: params.platformUserId,
          topicCode: topic.topicCode,
          isEnabled: topic.isEnabled,
        })
        .onConflictDoUpdate({
          target: [userNotificationTopics.userId, userNotificationTopics.topicCode],
          set: {
            isEnabled: topic.isEnabled,
            updatedAt: sql`now()`,
          },
        });
    }
  },

  async updateRole(platformUserId, role) {
    // C-1 (2026-07-26): a role change must kill existing sessions for that user, so a session minted
    // under the OLD role cannot keep riding on stale claims. `session_epoch` only increments when the
    // role actually changes (IS DISTINCT FROM), so a no-op call (role already correct) does not force
    // a needless re-login.
    const result = await runWebappSql(
      getWebappSqlDb(),
      sql`UPDATE platform_users SET
         role = ${role},
         session_epoch = session_epoch + CASE WHEN role IS DISTINCT FROM ${role} THEN 1 ELSE 0 END,
         updated_at = now()
       WHERE id = ${platformUserId}::uuid`,
    );
    if (result.rowCount === 0) {
      throw new Error(`updateRole: user ${platformUserId} not found`);
    }
  },

  async getProfileEmailFields(platformUserId) {
    const rows = await getWebappSqlDb()
      .select({
        email: drizzlePrimaryEmailCol,
        email_verified_at: drizzlePrimaryEmailConfirmedAtCol,
      })
      .from(platformUsers)
      .where(eq(platformUsers.id, platformUserId))
      .limit(1);
    if (rows.length === 0) {
      return { email: null, emailVerifiedAt: null };
    }
    const row = rows[0]!;
    return {
      email: row.email,
      emailVerifiedAt: nullableToIsoStringSafe(row.email_verified_at),
    };
  },

  async getCurrentPatientFio() {
    // The account profile is available even when the patient has no active clinic enrollment
    // (for example, after the only clinic archives the relationship). The organization-scoped
    // named root cannot be called without an active organization; the page falls back to the
    // canonical FIO already carried by the verified session in that state.
    if (!getCurrentDbPrincipalOrganizationId()) return null;
    const result = await runWebappNamedRoot<{
      last_name: string | null;
      first_name: string | null;
      patronymic: string | null;
      display_name: string;
    }>(
      getWebappSqlDb(),
      'app.read_current_patient_fio()',
      [],
      sql`SELECT * FROM app.read_current_patient_fio()`,
    );
    const row = result.rows[0];
    return row
      ? {
          lastName: row.last_name,
          firstName: row.first_name,
          patronymic: row.patronymic,
          displayName: row.display_name,
        }
      : null;
  },

  async updateCurrentPatientFio(params) {
    const args = [params.lastName, params.firstName, params.patronymic ?? ''] as const;
    const result = await runWebappNamedRoot<{
      last_name: string;
      first_name: string;
      patronymic: string | null;
      display_name: string;
    }>(
      getWebappSqlDb(),
      'app.update_current_patient_fio(text,text,text)',
      args,
      sql`SELECT * FROM app.update_current_patient_fio(${args[0]}, ${args[1]}, ${args[2]})`,
    );
    const row = result.rows[0];
    return row
      ? {
          lastName: row.last_name,
          firstName: row.first_name,
          patronymic: row.patronymic,
          displayName: row.display_name,
        }
      : null;
  },

  async clearStaffAccountEmail(platformUserId) {
    const db = getWebappSqlDb();
    const current = await db
      .select({ email: userContacts.valueNormalized })
      .from(userContacts)
      .innerJoin(platformUsers, eq(platformUsers.id, userContacts.platformUserId))
      .where(
        and(
          eq(platformUsers.id, platformUserId),
          eq(userContacts.contactKind, 'email'),
          eq(userContacts.isPrimary, true),
          inArray(platformUsers.role, ['doctor', 'admin']),
          isNull(platformUsers.mergedIntoId),
        ),
      )
      .limit(1);
    if (current.length === 0) {
      return { ok: false as const, reason: 'not_found_or_not_staff' as const };
    }
    const email = current[0]?.email;
    if (email == null || email.trim() === '') {
      return { ok: false as const, reason: 'already_empty' as const };
    }
    await mutateCanonicalUserContactsWebapp(db, platformUserId, [
      { action: 'remove', kind: 'email' },
    ]);
    return { ok: true as const };
  },

  async patchAdminClientProfile({ platformUserId, patch }) {
    const pool = getPool();

    if (
      patch.firstName === undefined &&
      patch.lastName === undefined &&
      patch.email === undefined &&
      patch.phoneNormalized === undefined
    ) {
      return { ok: false as const, reason: 'nothing_to_update' as const };
    }

    if (patch.phoneNormalized !== undefined) {
      trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.AdminManualProfilePatch);
    }

    try {
      return await withPoolTransaction(pool, async (client) => {
        const db = txExecutor(client);
        // Same-statement SET semantics as the previous raw SQL: display_name is built from the
        // NEW value when a field is being patched, otherwise the row's CURRENT (pre-update) value —
        // never the freshly-set one, matching Postgres's single-statement UPDATE evaluation.
        const nextFirstNameExpr =
          patch.firstName !== undefined ? sql`${patch.firstName}::text` : platformUsers.firstName;
        const nextLastNameExpr =
          patch.lastName !== undefined ? sql`${patch.lastName}::text` : platformUsers.lastName;
        const result = await db
          .update(platformUsers)
          .set({
            updatedAt: sql`now()`,
            ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
            ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
            ...(patch.firstName !== undefined || patch.lastName !== undefined
              ? {
                  displayName: sql`COALESCE(NULLIF(concat_ws(' ', ${nextLastNameExpr}, ${nextFirstNameExpr}, ${platformUsers.patronymic}), ''), '')`,
                }
              : {}),
          })
          .where(
            and(
              eq(platformUsers.id, platformUserId),
              eq(platformUsers.role, 'client'),
              isNull(platformUsers.mergedIntoId),
            ),
          );

        if ((result.rowCount ?? 0) === 0) {
          throw new PatchAdminClientProfileNoRowsError();
        }

        if (patch.phoneNormalized !== undefined) {
          const pn =
            patch.phoneNormalized != null && String(patch.phoneNormalized).trim().length > 0
              ? String(patch.phoneNormalized).trim()
              : null;
          await applyPlatformUserPhoneHistoryTransition(client, {
            platformUserId,
            newPhoneNormalized: pn,
            source: 'admin',
          });
        }

        if (patch.firstName !== undefined || patch.lastName !== undefined) {
          await syncUserIdentityFioMirrorWebapp(client, platformUserId);
        }

        if (patch.phoneNormalized !== undefined || patch.email !== undefined) {
          const mutations = [];
          if (patch.phoneNormalized !== undefined) {
            const phone = patch.phoneNormalized?.trim();
            mutations.push(
              phone
                ? {
                    action: 'upsert' as const,
                    kind: 'phone' as const,
                    valueNormalized: phone,
                    isPrimary: true,
                    confirmedAt: new Date().toISOString(),
                    sourceOrigin: 'direct' as const,
                  }
                : { action: 'remove' as const, kind: 'phone' as const },
            );
          }
          if (patch.email !== undefined) {
            const email = patch.email?.trim().toLowerCase();
            mutations.push(
              email
                ? {
                    action: 'upsert' as const,
                    kind: 'email' as const,
                    valueNormalized: email,
                    isPrimary: true,
                    confirmedAt: null,
                    sourceOrigin: 'direct' as const,
                  }
                : { action: 'remove' as const, kind: 'email' as const },
            );
          }
          await mutateCanonicalUserContactsWebapp(client, platformUserId, mutations);
        }

        return { ok: true as const };
      });
    } catch (e) {
      if (e instanceof PatchAdminClientProfileNoRowsError) {
        return { ok: false as const, reason: 'not_found_or_not_client' as const };
      }
      throw e;
    }
  },

  findPlatformUserIdWithEmailConflict(canonicalId, email) {
    return findPlatformUserIdWithEmailConflict(canonicalId, email);
  },

  findPlatformUserIdWithPhoneConflict(canonicalId, phoneNormalized) {
    return findPlatformUserIdWithPhoneConflict(canonicalId, phoneNormalized);
  },
};

export const inMemoryUserProjectionPort: UserProjectionPort = {
  findByPhoneNormalized: async () => null,
  updatePhone: async () => {},
  updateProfileByPhone: async () => {},
  upsertNotificationTopics: async () => {},
  updateRole: async () => {},
  getProfileEmailFields: async () => ({ email: null, emailVerifiedAt: null }),
  getCurrentPatientFio: async () => null,
  updateCurrentPatientFio: async (params) => ({ ...params, displayName: '' }),
  clearStaffAccountEmail: async () => ({ ok: true as const }),
  patchAdminClientProfile: async () => ({ ok: true as const }),
  findPlatformUserIdWithEmailConflict: async () => null,
  findPlatformUserIdWithPhoneConflict: async () => null,
};
