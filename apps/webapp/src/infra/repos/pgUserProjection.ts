/**
 * Wave 3 phase 14B + R0/S3R — projection transactions go through `withPoolTransaction`.
 * Domain SQL — Drizzle CRUD + `runWebappSql` for session/constraint fragments.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import { withPoolTransaction } from '@/infra/db/withClient';
import { nullableToIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappSql,
  runWebappNamedRoot,
  webappSqlFromPgText,
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
import {
  platformUsers,
  userContacts,
  userNotificationTopics,
} from '../../../db/schema/schema';

function txExecutor(client: PoolClient): WebappSqlExecutor {
  return getWebappSqlFromPgClient(client);
}

async function txSql<T = unknown>(
  client: PoolClient,
  fragment: ReturnType<typeof sql.raw> | Parameters<typeof runWebappSql<T>>[1],
) {
  return runWebappSql<T>(txExecutor(client), fragment);
}

function deferPlatformUserUniqueConstraints(client: PoolClient) {
  return txSql(
    client,
    sql`SET CONSTRAINTS platform_users_integrator_user_id_key DEFERRED`,
  );
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

async function upsertFromProjectionTx(
  client: PoolClient,
  params: {
    integratorUserId: string;
    phoneNormalized?: string;
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    channelCode?: string;
    externalId?: string;
  },
): Promise<string> {
  const { platformUserId } = await upsertIdentityProjection(client, params);
  return platformUserId;
}

export const pgUserProjectionPort: UserProjectionPort = {
  async upsertFromProjection(params) {
    const pool = getPool();
    const id = await withPoolTransaction(pool, async (client) => {
      await deferPlatformUserUniqueConstraints(client);
      const id = await upsertFromProjectionTx(client, params);
      return id;
    });
    if (params.phoneNormalized?.trim()) {
      trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.IntegratorUpsertFromProjection);
    }
    return { platformUserId: id };
  },

  async findByIntegratorId(integratorUserId) {
    const rows = await getWebappSqlDb()
      .select({
        id: platformUsers.id,
        phone_normalized: drizzlePrimaryPhoneCol,
      })
      .from(platformUsers)
      .where(
        and(
          eq(platformUsers.integratorUserId, Number(integratorUserId)),
          isNull(platformUsers.mergedIntoId),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0]!;
    return { platformUserId: row.id, phoneNormalized: row.phone_normalized };
  },

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
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    let idx = 0;
    if (params.firstName !== undefined) {
      sets.push(`first_name = $${++idx}`);
      vals.push(params.firstName);
    }
    if (params.lastName !== undefined) {
      sets.push(`last_name = $${++idx}`);
      vals.push(params.lastName);
    }
    if (vals.length === 0 && params.email === undefined) return;
    vals.push(params.phoneNormalized);
    const pool = getPool();
    await withPoolTransaction(pool, async (client) => {
      const updated = await txSql<{ id: string }>(
        client,
        webappSqlFromPgText(
          `UPDATE platform_users SET ${sets.join(', ')}
         WHERE EXISTS (SELECT 1 FROM user_contacts uc WHERE uc.platform_user_id = platform_users.id
           AND uc.contact_kind = 'phone' AND uc.value_normalized = $${idx + 1})
           AND merged_into_id IS NULL
         RETURNING id`,
          vals,
        ),
      );
      for (const row of updated.rows) {
        await syncUserIdentityFioMirrorWebapp(client, row.id);
      }
      if (params.email !== undefined) {
        for (const row of updated.rows) {
          await mutateCanonicalUserContactsWebapp(client, row.id, params.email?.trim()
            ? [{ action: 'upsert', kind: 'email', valueNormalized: params.email.trim().toLowerCase(),
                isPrimary: true, confirmedAt: null, sourceOrigin: 'direct' }]
            : [{ action: 'remove', kind: 'email' }]);
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
    await mutateCanonicalUserContactsWebapp(db, platformUserId, [{ action: 'remove', kind: 'email' }]);
    return { ok: true as const };
  },

  async patchAdminClientProfile({ platformUserId, patch }) {
    const pool = getPool();
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    let n = 0;
    let firstNameExpr = 'first_name';
    let lastNameExpr = 'last_name';

    if (patch.firstName !== undefined) {
      n += 1;
      sets.push(`first_name = $${n}`);
      vals.push(patch.firstName);
      firstNameExpr = `$${n}::text`;
    }
    if (patch.lastName !== undefined) {
      n += 1;
      sets.push(`last_name = $${n}`);
      vals.push(patch.lastName);
      lastNameExpr = `$${n}::text`;
    }
    if (patch.firstName !== undefined || patch.lastName !== undefined) {
      sets.push(`display_name = COALESCE(NULLIF(concat_ws(' ',
        ${lastNameExpr},
        ${firstNameExpr},
        patronymic
      ), ''), '')`);
    }
    if (patch.phoneNormalized !== undefined) {
      trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.AdminManualProfilePatch);
    }

    if (patch.firstName === undefined && patch.lastName === undefined
      && patch.email === undefined && patch.phoneNormalized === undefined) {
      return { ok: false as const, reason: 'nothing_to_update' as const };
    }

    n += 1;
    const idPlaceholder = n;
    vals.push(platformUserId);

    try {
      return await withPoolTransaction(pool, async (client) => {
        const result = await txSql(
          client,
          webappSqlFromPgText(
            `UPDATE platform_users SET ${sets.join(', ')}
           WHERE id = $${idPlaceholder}::uuid AND role = 'client' AND merged_into_id IS NULL`,
            vals,
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

        if (
          patch.phoneNormalized !== undefined ||
          patch.email !== undefined
        ) {
          const mutations = [];
          if (patch.phoneNormalized !== undefined) {
            const phone = patch.phoneNormalized?.trim();
            mutations.push(phone
              ? { action: 'upsert' as const, kind: 'phone' as const, valueNormalized: phone,
                  isPrimary: true, confirmedAt: new Date().toISOString(), sourceOrigin: 'direct' as const }
              : { action: 'remove' as const, kind: 'phone' as const });
          }
          if (patch.email !== undefined) {
            const email = patch.email?.trim().toLowerCase();
            mutations.push(email
              ? { action: 'upsert' as const, kind: 'email' as const, valueNormalized: email,
                  isPrimary: true, confirmedAt: null, sourceOrigin: 'direct' as const }
              : { action: 'remove' as const, kind: 'email' as const });
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
  upsertFromProjection: async () => ({ platformUserId: '' }),
  findByIntegratorId: async () => null,
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
