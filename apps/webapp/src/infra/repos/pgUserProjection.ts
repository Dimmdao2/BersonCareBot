/**
 * Wave 3 phase 14B + R0/S3R — projection transactions go through `withPoolTransaction`.
 * Domain SQL — `runWebappPgText` / `getWebappSqlFromPgClient`.
 */
import { getPool } from '@/infra/db/client';
import { withPoolTransaction } from '@/infra/db/withClient';
import { nullableToIsoStringSafe, toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';
import { findCanonicalUserIdByChannelBinding } from '@/infra/repos/pgCanonicalPlatformUser';
import {
  MergeConflictError,
  MergeDependentConflictError,
} from '@/infra/repos/platformUserMergeErrors';
import {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
  enrichPickMergeCandidatesWithBookingCounts,
} from '@/infra/repos/pgPlatformUserMerge';
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from '@/modules/platform-access/trustedPhonePolicy';
import type { PoolClient } from 'pg';
import { upsertBroadcastDefaultsAfterChannelBind } from '@/infra/upsertBroadcastDefaultsAfterChannelBind';
import { applyPlatformUserPhoneHistoryTransition } from '@/infra/repos/pgPhoneHistory';
import {
  findPlatformUserIdWithEmailConflict,
  findPlatformUserIdWithPhoneConflict,
} from '@/infra/repos/pgAdminClientProfileConflicts';

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

export type UserProjectionPort = {
  upsertFromProjection: (params: {
    integratorUserId: string;
    phoneNormalized?: string;
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    channelCode?: string;
    externalId?: string;
  }) => Promise<{ platformUserId: string }>;
  findByIntegratorId: (integratorUserId: string) => Promise<{
    platformUserId: string;
    phoneNormalized?: string | null;
  } | null>;
  findByPhoneNormalized: (phoneNormalized: string) => Promise<{ platformUserId: string } | null>;
  updatePhone: (platformUserId: string, phoneNormalized: string) => Promise<void>;
  /** Update structured profile fields (first_name, last_name, email) by phone; no-op if no user found. */
  updateProfileByPhone: (params: {
    phoneNormalized: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }) => Promise<void>;
  upsertNotificationTopics: (params: {
    platformUserId: string;
    topics: { topicCode: string; isEnabled: boolean }[];
  }) => Promise<void>;
  updateRole: (platformUserId: string, role: string) => Promise<void>;
  getProfileEmailFields: (platformUserId: string) => Promise<{
    email: string | null;
    emailVerifiedAt: string | null;
  }>;
  /** Сброс email у своего аккаунта врача/админа (`role IN ('doctor','admin')`). */
  clearStaffAccountEmail: (
    platformUserId: string,
  ) => Promise<{ ok: true } | { ok: false; reason: 'not_found_or_not_staff' | 'already_empty' }>;
  /**
   * Admin (webapp): правка ФИО/email/телефона канонического клиента по `platform_users.id`.
   * Только `role = client`, `merged_into_id IS NULL`. Смена email сбрасывает верификацию при изменении значения.
   */
  patchAdminClientProfile: (params: {
    platformUserId: string;
    patch: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phoneNormalized?: string | null;
    };
  }) => Promise<
    { ok: true } | { ok: false; reason: 'nothing_to_update' | 'not_found_or_not_client' }
  >;
  findPlatformUserIdWithEmailConflict: (
    canonicalId: string,
    email: string,
  ) => Promise<string | null>;
  findPlatformUserIdWithPhoneConflict: (
    canonicalId: string,
    phoneNormalized: string,
  ) => Promise<string | null>;
};

type PuRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: Date;
};

async function loadPuRow(client: PoolClient, id: string): Promise<PuRow | null> {
  const r = await txPgText<PuRow>(
    client,
    `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, merged_into_id,
            display_name, first_name, last_name, email, created_at
     FROM platform_users WHERE id = $1::uuid`,
    [id],
  );
  return r.rows[0] ?? null;
}

/**
 * Collapse duplicate canonical `platform_users` rows referenced by integrator/messenger resolution (Phase B).
 */
export async function mergeCanonicalPlatformUserCandidates(
  client: PoolClient,
  candidateIds: string[],
  reason: 'projection' | 'phone_bind',
): Promise<string> {
  return mergeCandidates(client, candidateIds, reason);
}

async function mergeCandidates(
  client: PoolClient,
  candidateIds: string[],
  reason: 'projection' | 'phone_bind',
): Promise<string> {
  const uniq = [...new Set(candidateIds)].filter(Boolean);
  if (uniq.length === 0) throw new MergeConflictError('mergeCandidates: empty', candidateIds);
  if (uniq.length === 1) return uniq[0]!;
  let ids = [...uniq].sort();
  while (ids.length > 1) {
    const id0 = ids[0]!;
    const id1 = ids[1]!;
    const a = await loadPuRow(client, id0);
    const b = await loadPuRow(client, id1);
    if (!a || !b) throw new MergeConflictError('mergeCandidates: row missing', ids);
    const [ea, eb] = await enrichPickMergeCandidatesWithBookingCounts(client, a, b);
    const { target, duplicate } = pickMergeTargetId(ea, eb);
    try {
      await mergePlatformUsersInTransaction(client, target, duplicate, reason);
    } catch (e) {
      if (e instanceof MergeDependentConflictError) throw e;
      if (e instanceof MergeConflictError) throw e;
      throw e;
    }
    ids = ids.filter((x) => x !== duplicate);
  }
  return ids[0]!;
}

async function collectCandidateIds(
  client: PoolClient,
  params: {
    integratorUserId: string;
    phoneNormalized?: string;
    channelCode?: string;
    externalId?: string;
  },
): Promise<string[]> {
  const ids: string[] = [];
  const byInt = await txPgText<{ id: string }>(
    client,
    `SELECT id FROM platform_users
     WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL
     LIMIT 3`,
    [params.integratorUserId],
  );
  if (byInt.rows.length > 1)
    throw new MergeConflictError(
      'ambiguous integrator_user_id match',
      byInt.rows.map((r) => r.id),
    );
  if (byInt.rows[0]) ids.push(byInt.rows[0].id);
  // Phone match is intentional for signed integrator webhook: payload asserts this user owns the number
  // (may merge a row without patient_phone_trust_at; UPDATE path then sets trust when phone is supplied).
  if (params.phoneNormalized) {
    const byPhone = await txPgText<{ id: string }>(
      client,
      `SELECT id FROM platform_users
       WHERE phone_normalized = $1 AND merged_into_id IS NULL
       LIMIT 3`,
      [params.phoneNormalized],
    );
    if (byPhone.rows.length > 1)
      throw new MergeConflictError(
        'ambiguous phone_normalized match',
        byPhone.rows.map((r) => r.id),
      );
    if (byPhone.rows[0]) ids.push(byPhone.rows[0].id);
  }
  if (params.channelCode && params.externalId) {
    const ch = await findCanonicalUserIdByChannelBinding(
      getWebappSqlFromPgClient(client),
      params.channelCode,
      params.externalId,
    );
    if (ch) ids.push(ch);
  }
  return [...new Set(ids)];
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
  let candidateIds = await collectCandidateIds(client, {
    integratorUserId: params.integratorUserId,
    phoneNormalized: params.phoneNormalized,
    channelCode: params.channelCode,
    externalId: params.externalId,
  });

  let userId: string;

  if (candidateIds.length === 0) {
    const displayName = params.displayName ?? '';
    const ins = await txPgText<{ id: string }>(
      client,
      `INSERT INTO platform_users (
         integrator_user_id, phone_normalized, display_name, first_name, last_name, email,
         patient_phone_trust_at
       )
       VALUES (
         $1::bigint, $2, $3, $4, $5, $6,
         CASE WHEN $2::text IS NOT NULL AND trim($2::text) <> '' THEN now() ELSE NULL END
       ) RETURNING id`,
      [
        params.integratorUserId,
        params.phoneNormalized ?? null,
        displayName,
        params.firstName ?? null,
        params.lastName ?? null,
        params.email ?? null,
      ],
    );
    userId = ins.rows[0]!.id;
  } else {
    userId = await mergeCandidates(client, candidateIds, 'projection');
    await txPgText(
      client,
      `UPDATE platform_users SET
         display_name = CASE
           WHEN $2::text IS NOT NULL
            AND trim($2::text) <> ''
            AND $3::text IS NOT NULL
            AND trim($3::text) <> ''
            AND $4::text IS NOT NULL
            AND trim($4::text) <> ''
           THEN $2::text
           WHEN (display_name IS NULL OR trim(display_name) = '')
            AND $2::text IS NOT NULL
            AND trim($2::text) <> ''
           THEN $2::text
           ELSE display_name
         END,
         first_name = CASE
           WHEN $8::text IN ('telegram', 'max') THEN COALESCE(first_name, $3::text)
           ELSE COALESCE($3::text, first_name)
         END,
         last_name = CASE
           WHEN $8::text IN ('telegram', 'max') THEN COALESCE(last_name, $4::text)
           ELSE COALESCE($4::text, last_name)
         END,
         email = COALESCE($5::text, email),
         phone_normalized = COALESCE($6::text, phone_normalized),
         patient_phone_trust_at = CASE
           WHEN $6::text IS NOT NULL AND trim($6::text) <> '' THEN now()
           ELSE patient_phone_trust_at
         END,
         integrator_user_id = COALESCE(integrator_user_id, $7::bigint),
         updated_at = now()
       WHERE id = $1::uuid`,
      [
        userId,
        params.displayName ?? null,
        params.firstName ?? null,
        params.lastName ?? null,
        params.email ?? null,
        params.phoneNormalized ?? null,
        params.integratorUserId,
        params.channelCode ?? null,
      ],
    );
  }

  if (params.channelCode && params.externalId) {
    const insBinding = await txPgText<{ user_id: string | null }>(
      client,
      `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (channel_code, external_id) DO NOTHING
       RETURNING user_id`,
      [userId, params.channelCode, params.externalId],
    );
    if (insBinding.rows.length > 0) {
      await upsertBroadcastDefaultsAfterChannelBind(getWebappSqlFromPgClient(client), userId, params.channelCode);
    }
  }

  return userId;
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
