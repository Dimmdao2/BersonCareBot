/**
 * Wave 3 phase 14B + R0/S3R — projection transactions go through `withPoolTransaction`.
 * Domain SQL — `runWebappPgText` / `getWebappSqlFromPgClient`.
 */
import { getPool } from '@/infra/db/client';
import { withPoolTransaction } from '@/infra/db/withClient';
import { nullableToIsoStringSafe, toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';
import { MergeConflictError } from '@/infra/repos/platformUserMergeErrors';
import {
  upsertIdentityProjection,
  collapseIdentityProjectionCandidates,
} from '@bersoncare/platform-merge';
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

function txPgText<T = unknown>(
  client: PoolClient,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
}

function deferPlatformUserUniqueConstraints(client: PoolClient) {
  return txPgText(
    client,
    `SET CONSTRAINTS platform_users_phone_normalized_key, platform_users_integrator_user_id_key DEFERRED`,
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
    const result = await runWebappPgText<{ id: string; phone_normalized: string | null }>(
      `SELECT id, phone_normalized FROM platform_users
       WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL`,
      [integratorUserId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0]!;
    return { platformUserId: row.id, phoneNormalized: row.phone_normalized };
  },

  async findByPhoneNormalized(phoneNormalized) {
    const result = await runWebappPgText<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE phone_normalized = $1 AND merged_into_id IS NULL
       LIMIT 1`,
      [phoneNormalized],
    );
    const row = result.rows[0];
    return row ? { platformUserId: row.id } : null;
  },

  async updatePhone(platformUserId, phoneNormalized) {
    const pool = getPool();
    trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.IntegratorUpdatePhone);
    await withPoolTransaction(pool, async (client) => {
      await txPgText(
        client,
        'UPDATE platform_users SET phone_normalized = $1, patient_phone_trust_at = now(), updated_at = now() WHERE id = $2',
        [phoneNormalized, platformUserId],
      );
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
    if (params.email !== undefined) {
      sets.push(`email = $${++idx}`);
      vals.push(params.email);
    }
    if (vals.length === 0) return;
    vals.push(params.phoneNormalized);
    await runWebappPgText(
      `UPDATE platform_users SET ${sets.join(', ')}
       WHERE phone_normalized = $${idx + 1} AND merged_into_id IS NULL`,
      vals,
    );
  },

  async upsertNotificationTopics(params) {
    for (const topic of params.topics) {
      await runWebappPgText(
        `INSERT INTO user_notification_topics (user_id, topic_code, is_enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, topic_code) DO UPDATE SET
           is_enabled = EXCLUDED.is_enabled, updated_at = now()`,
        [params.platformUserId, topic.topicCode, topic.isEnabled],
      );
    }
  },

  async updateRole(platformUserId, role) {
    // C-1 (2026-07-26): a role change must kill existing sessions for that user, so a session minted
    // under the OLD role cannot keep riding on stale claims. `session_epoch` only increments when the
    // role actually changes (IS DISTINCT FROM), so a no-op call (role already correct) does not force
    // a needless re-login.
    const result = await runWebappPgText(
      `UPDATE platform_users SET
         role = $1,
         session_epoch = session_epoch + CASE WHEN role IS DISTINCT FROM $1 THEN 1 ELSE 0 END,
         updated_at = now()
       WHERE id = $2`,
      [role, platformUserId],
    );
    if (result.rowCount === 0) {
      throw new Error(`updateRole: user ${platformUserId} not found`);
    }
  },

  async getProfileEmailFields(platformUserId) {
    const result = await runWebappPgText<{
      email: string | null;
      email_verified_at: Date | string | null;
    }>('SELECT email, email_verified_at FROM platform_users WHERE id = $1', [platformUserId]);
    if (result.rows.length === 0) {
      return { email: null, emailVerifiedAt: null };
    }
    const row = result.rows[0];
    return {
      email: row.email,
      emailVerifiedAt: nullableToIsoStringSafe(row.email_verified_at),
    };
  },

  async clearStaffAccountEmail(platformUserId) {
    const current = await runWebappPgText<{ email: string | null }>(
      `SELECT email FROM platform_users
       WHERE id = $1::uuid AND role IN ('doctor', 'admin') AND merged_into_id IS NULL`,
      [platformUserId],
    );
    if (current.rows.length === 0) {
      return { ok: false as const, reason: 'not_found_or_not_staff' as const };
    }
    const email = current.rows[0]?.email;
    if (email == null || email.trim() === '') {
      return { ok: false as const, reason: 'already_empty' as const };
    }
    await runWebappPgText(
      `UPDATE platform_users
       SET email = NULL, email_normalized = NULL, email_verified_at = NULL, updated_at = now()
       WHERE id = $1::uuid AND role IN ('doctor', 'admin') AND merged_into_id IS NULL`,
      [platformUserId],
    );
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
    if (patch.email !== undefined) {
      n += 1;
      const emailN = n;
      sets.push(`email = $${emailN}`);
      vals.push(patch.email);
      sets.push(
        `email_verified_at = CASE
          WHEN $${emailN}::text IS NULL OR btrim(COALESCE($${emailN}::text, '')) = '' THEN NULL
          WHEN lower(btrim(COALESCE($${emailN}::text, ''))) IS DISTINCT FROM lower(btrim(COALESCE(email, ''))) THEN NULL
          ELSE email_verified_at
        END`,
      );
      sets.push(
        `email_normalized = CASE
          WHEN $${emailN}::text IS NULL OR btrim(COALESCE($${emailN}::text, '')) = '' THEN NULL
          ELSE lower(btrim($${emailN}::text))
        END`,
      );
    }
    if (patch.phoneNormalized !== undefined) {
      trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.AdminManualProfilePatch);
      n += 1;
      const phoneN = n;
      sets.push(`phone_normalized = $${phoneN}`);
      vals.push(patch.phoneNormalized);
      sets.push(
        `patient_phone_trust_at = CASE
          WHEN $${phoneN}::text IS NULL OR btrim(COALESCE($${phoneN}::text, '')) = '' THEN NULL
          ELSE now()
        END`,
      );
    }

    if (sets.length === 1) {
      return { ok: false as const, reason: 'nothing_to_update' as const };
    }

    n += 1;
    const idPlaceholder = n;
    vals.push(platformUserId);

    try {
      return await withPoolTransaction(pool, async (client) => {
        const result = await txPgText(
          client,
          `UPDATE platform_users SET ${sets.join(', ')}
           WHERE id = $${idPlaceholder}::uuid AND role = 'client' AND merged_into_id IS NULL`,
          vals,
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
  clearStaffAccountEmail: async () => ({ ok: true as const }),
  patchAdminClientProfile: async () => ({ ok: true as const }),
  findPlatformUserIdWithEmailConflict: async () => null,
  findPlatformUserIdWithPhoneConflict: async () => null,
};
