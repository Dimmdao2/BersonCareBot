import { getPool } from "@/infra/db/client";
import { findCanonicalUserIdByChannelBinding } from "@/infra/repos/pgCanonicalPlatformUser";
import { MergeConflictError, MergeDependentConflictError } from "@/infra/repos/platformUserMergeErrors";
import { mergePlatformUsersInTransaction, pickMergeTargetId, enrichPickMergeCandidatesWithBookingCounts } from "@/infra/repos/pgPlatformUserMerge";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";
import type { PoolClient } from "pg";
import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";
import { applyPlatformUserPhoneHistoryTransition } from "@/infra/repos/pgPhoneHistory";

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
  /** Rubitime appointment projection: ensure canonical client row exists for phone (create/enrich/merge). */
  ensureClientFromAppointmentProjection: (params: {
    phoneNormalized: string;
    integratorUserId?: string | null;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }) => Promise<{
    platformUserId: string;
    contactEmailSetup?: { emailNormalized: string };
  }>;
  findByIntegratorId: (integratorUserId: string) => Promise<{
    platformUserId: string;
    phoneNormalized?: string | null;
  } | null>;
  findByPhoneNormalized: (phoneNormalized: string) => Promise<{ platformUserId: string } | null>;
  updatePhone: (platformUserId: string, phoneNormalized: string) => Promise<void>;
  updateDisplayName: (platformUserId: string, displayName: string) => Promise<void>;
  /** Update profile (first_name, last_name, email, display_name) by phone; no-op if no user found. */
  updateProfileByPhone: (params: {
    phoneNormalized: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    displayName?: string | null;
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
  /**
   * Admin (webapp): правка ФИО/email/телефона канонического клиента по `platform_users.id`.
   * Только `role = client`, `merged_into_id IS NULL`. Смена email сбрасывает верификацию при изменении значения.
   */
  patchAdminClientProfile: (params: {
    platformUserId: string;
    patch: {
      displayName?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phoneNormalized?: string | null;
    };
  }) => Promise<{ ok: true } | { ok: false; reason: "nothing_to_update" | "not_found_or_not_client" }>;
  /** Rubitime webhook → user.email.autobind (USER_TODO_STAGE; см. AUDIT-BACKLOG-024). */
  applyRubitimeEmailAutobind: (params: {
    phoneNormalized: string;
    email: string;
  }) => Promise<
    | { outcome: "applied"; platformUserId: string }
    | {
        outcome: "skipped_no_user" | "skipped_invalid_email" | "skipped_conflict";
      }
    | { outcome: "skipped_verified"; platformUserId: string }
  >;
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
  const r = await client.query<PuRow>(
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
  reason: "projection" | "phone_bind",
): Promise<string> {
  return mergeCandidates(client, candidateIds, reason);
}

async function mergeCandidates(
  client: PoolClient,
  candidateIds: string[],
  reason: "projection" | "phone_bind",
): Promise<string> {
  const uniq = [...new Set(candidateIds)].filter(Boolean);
  if (uniq.length === 0) throw new MergeConflictError("mergeCandidates: empty", candidateIds);
  if (uniq.length === 1) return uniq[0]!;
  let ids = [...uniq].sort();
  while (ids.length > 1) {
    const id0 = ids[0]!;
    const id1 = ids[1]!;
    const a = await loadPuRow(client, id0);
    const b = await loadPuRow(client, id1);
    if (!a || !b) throw new MergeConflictError("mergeCandidates: row missing", ids);
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
  const byInt = await client.query<{ id: string }>(
    `SELECT id FROM platform_users
     WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL
     LIMIT 3`,
    [params.integratorUserId],
  );
  if (byInt.rows.length > 1) throw new MergeConflictError("ambiguous integrator_user_id match", byInt.rows.map(r => r.id));
  if (byInt.rows[0]) ids.push(byInt.rows[0].id);
  // Phone match is intentional for signed integrator webhook: payload asserts this user owns the number
  // (may merge a row without patient_phone_trust_at; UPDATE path then sets trust when phone is supplied).
  if (params.phoneNormalized) {
    const byPhone = await client.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE phone_normalized = $1 AND merged_into_id IS NULL
       LIMIT 3`,
      [params.phoneNormalized],
    );
    if (byPhone.rows.length > 1) throw new MergeConflictError("ambiguous phone_normalized match", byPhone.rows.map(r => r.id));
    if (byPhone.rows[0]) ids.push(byPhone.rows[0].id);
  }
  if (params.channelCode && params.externalId) {
    const ch = await findCanonicalUserIdByChannelBinding(client, params.channelCode, params.externalId);
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
    const displayName = params.displayName ?? "";
    const ins = await client.query<{ id: string }>(
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
    userId = await mergeCandidates(client, candidateIds, "projection");
    await client.query(
      `UPDATE platform_users SET
         display_name = CASE WHEN $2::text IS NOT NULL AND trim($2::text) <> '' THEN $2::text ELSE display_name END,
         first_name = COALESCE($3::text, first_name),
         last_name = COALESCE($4::text, last_name),
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
      ],
    );
  }

  if (params.channelCode && params.externalId) {
    const insBinding = await client.query<{ user_id: string | null }>(
      `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (channel_code, external_id) DO NOTHING
       RETURNING user_id`,
      [userId, params.channelCode, params.externalId],
    );
    if (insBinding.rows.length > 0) {
      await upsertBroadcastDefaultsAfterChannelBind(client, userId, params.channelCode);
    }
  }

  return userId;
}

function normalizeRubitimeContactEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  if (!trimmed || trimmed.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

async function ensureAppointmentClientTx(
  client: PoolClient,
  params: {
    phoneNormalized: string;
    integratorUserId?: string | null;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  },
): Promise<{
  userId: string;
  contactEmailSetup?: { emailNormalized: string };
}> {
  const ids: string[] = [];
  const byPhone = await client.query<{ id: string }>(
    `SELECT id FROM platform_users WHERE phone_normalized = $1 AND merged_into_id IS NULL LIMIT 2`,
    [params.phoneNormalized],
  );
  if (byPhone.rows.length > 1) {
    console.error("[ensureClientFromAppointmentProjection] duplicate canonical phone rows (redacted)", {
      count: byPhone.rows.length,
      ids: byPhone.rows.map((r) => r.id),
    });
    throw new MergeConflictError("multiple canonical users for phone", byPhone.rows.map(r => r.id));
  }
  if (byPhone.rows[0]) ids.push(byPhone.rows[0].id);

  if (params.integratorUserId?.trim()) {
    const byInt = await client.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL LIMIT 2`,
      [params.integratorUserId.trim()],
    );
    if (byInt.rows.length > 1) {
      throw new MergeConflictError("multiple canonical users for integrator id", byInt.rows.map(r => r.id));
    }
    if (byInt.rows[0]) ids.push(byInt.rows[0].id);
  }

  const emailNorm = normalizeRubitimeContactEmail(params.email);
  if (ids.length === 0 && emailNorm) {
    const byEmail = await client.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE email_normalized = lower(btrim($1::text)) AND merged_into_id IS NULL
       LIMIT 2`,
      [emailNorm],
    );
    if (byEmail.rows.length > 1) {
      throw new MergeConflictError("multiple canonical users for email", byEmail.rows.map((r) => r.id));
    }
    if (byEmail.rows[0]) ids.push(byEmail.rows[0].id);
  }

  const uniq = [...new Set(ids)];
  const displayName =
    params.displayName?.trim() ||
    [params.lastName, params.firstName].filter(Boolean).join(" ").trim() ||
    params.phoneNormalized;

  if (uniq.length === 0) {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO platform_users (
         phone_normalized, display_name, first_name, last_name, email, email_normalized, role,
         integrator_user_id, patient_phone_trust_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         CASE WHEN $5::text IS NOT NULL AND btrim($5::text) <> '' THEN lower(btrim($5::text)) ELSE NULL END,
         'client', $6::bigint,
         CASE WHEN $1::text IS NOT NULL AND btrim($1::text) <> '' THEN now() ELSE NULL END
       )
       RETURNING id`,
      [
        params.phoneNormalized,
        displayName,
        params.firstName ?? null,
        params.lastName ?? null,
        emailNorm,
        params.integratorUserId?.trim() ? params.integratorUserId : null,
      ],
    );
    const newUserId = ins.rows[0]!.id;
    return {
      userId: newUserId,
      contactEmailSetup: emailNorm
        ? { emailNormalized: emailNorm.trim().toLowerCase() }
        : undefined,
    };
  }

  const userId = await mergeCandidates(client, uniq, "projection");

  let contactEmailSetup: { emailNormalized: string } | undefined;
  if (emailNorm) {
    const emailNormalized = emailNorm.trim().toLowerCase();
    const prev = await client.query<{ email_normalized: string | null }>(
      `SELECT email_normalized FROM platform_users WHERE id = $1::uuid`,
      [userId],
    );
    const prevNorm = prev.rows[0]?.email_normalized ?? null;
    if (prevNorm !== emailNormalized) {
      contactEmailSetup = { emailNormalized };
    }
  }

  // Existing user: enrich contact email / trusted Rubitime phone; never overwrite display/FIO from Rubitime.
  await client.query(
    `UPDATE platform_users SET
       email = CASE WHEN $2::text IS NOT NULL AND trim($2::text) <> '' THEN $2::text ELSE email END,
       email_normalized = CASE
         WHEN $2::text IS NOT NULL AND trim($2::text) <> ''
              AND lower(trim($2::text)) IS DISTINCT FROM lower(trim(coalesce(email, '')))
           THEN lower(trim($2::text))
         WHEN $2::text IS NOT NULL AND trim($2::text) <> '' THEN email_normalized
         ELSE email_normalized
       END,
       email_verified_at = CASE
         WHEN $2::text IS NOT NULL AND trim($2::text) <> ''
              AND lower(trim($2::text)) IS DISTINCT FROM lower(trim(coalesce(email, '')))
           THEN NULL
         ELSE email_verified_at
       END,
       integrator_user_id = COALESCE(integrator_user_id, $3::bigint),
       phone_normalized = COALESCE(phone_normalized, $4::text),
       patient_phone_trust_at = CASE
         WHEN $4::text IS NOT NULL AND trim($4::text) <> '' THEN now()
         ELSE patient_phone_trust_at
       END,
       updated_at = now()
     WHERE id = $1::uuid`,
    [
      userId,
      emailNorm,
      params.integratorUserId?.trim() ?? null,
      params.phoneNormalized,
    ],
  );

  return { userId, contactEmailSetup };
}

export const pgUserProjectionPort: UserProjectionPort = {
  async upsertFromProjection(params) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SET CONSTRAINTS platform_users_phone_normalized_key, platform_users_integrator_user_id_key DEFERRED`,
      );
      const id = await upsertFromProjectionTx(client, params);
      await client.query("COMMIT");
      if (params.phoneNormalized?.trim()) {
        trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.IntegratorUpsertFromProjection);
      }
      return { platformUserId: id };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  async ensureClientFromAppointmentProjection(params) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SET CONSTRAINTS platform_users_phone_normalized_key, platform_users_integrator_user_id_key DEFERRED`,
      );
      const ensured = await ensureAppointmentClientTx(client, params);
      await client.query("COMMIT");
      if (params.phoneNormalized?.trim()) {
        trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.IntegratorUpsertFromProjection);
      }
      return {
        platformUserId: ensured.userId,
        contactEmailSetup: ensured.contactEmailSetup,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  async findByIntegratorId(integratorUserId) {
    const pool = getPool();
    const result = await pool.query<{ id: string; phone_normalized: string | null }>(
      `SELECT id, phone_normalized FROM platform_users
       WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL`,
      [integratorUserId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0]!;
    return { platformUserId: row.id, phoneNormalized: row.phone_normalized };
  },

  async updatePhone(platformUserId, phoneNormalized) {
    const pool = getPool();
    trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.IntegratorUpdatePhone);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE platform_users SET phone_normalized = $1, patient_phone_trust_at = now(), updated_at = now() WHERE id = $2",
        [phoneNormalized, platformUserId],
      );
      await applyPlatformUserPhoneHistoryTransition(client, {
        platformUserId,
        newPhoneNormalized: phoneNormalized,
        source: "projection",
      });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  async updateDisplayName(platformUserId, displayName) {
    const pool = getPool();
    const result = await pool.query(
      "UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2",
      [displayName, platformUserId],
    );
    if (result.rowCount === 0) {
      throw new Error(`updateDisplayName: user ${platformUserId} not found`);
    }
  },

  async updateProfileByPhone(params) {
    const pool = getPool();
    const sets: string[] = ["updated_at = now()"];
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
    if (params.displayName !== undefined) {
      sets.push(`display_name = $${++idx}`);
      vals.push(params.displayName);
    }
    if (vals.length === 0) return;
    vals.push(params.phoneNormalized);
    await pool.query(
      `UPDATE platform_users SET ${sets.join(", ")}
       WHERE phone_normalized = $${idx + 1} AND merged_into_id IS NULL`,
      vals,
    );
  },

  async upsertNotificationTopics(params) {
    const pool = getPool();
    for (const topic of params.topics) {
      await pool.query(
        `INSERT INTO user_notification_topics (user_id, topic_code, is_enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, topic_code) DO UPDATE SET
           is_enabled = EXCLUDED.is_enabled, updated_at = now()`,
        [params.platformUserId, topic.topicCode, topic.isEnabled],
      );
    }
  },

  async updateRole(platformUserId, role) {
    const pool = getPool();
    const result = await pool.query(
      "UPDATE platform_users SET role = $1, updated_at = now() WHERE id = $2",
      [role, platformUserId],
    );
    if (result.rowCount === 0) {
      throw new Error(`updateRole: user ${platformUserId} not found`);
    }
  },

  async applyRubitimeEmailAutobind(params) {
    const emailNorm = params.email.trim();
    const basic =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm) && emailNorm.length <= 320;
    if (!basic) {
      return { outcome: "skipped_invalid_email" as const };
    }
    const phone = params.phoneNormalized.trim();
    const pool = getPool();
    const row = await pool.query<{ id: string; email_verified_at: Date | null }>(
      `SELECT id, email_verified_at FROM platform_users
       WHERE phone_normalized = $1 AND merged_into_id IS NULL`,
      [phone],
    );
    if (row.rows.length === 0) {
      return { outcome: "skipped_no_user" as const };
    }
    const u = row.rows[0];
    if (u.email_verified_at) {
      return { outcome: "skipped_verified" as const, platformUserId: u.id };
    }
    const conflict = await pool.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE id <> $1 AND email IS NOT NULL AND lower(trim(email)) = lower(trim($2))`,
      [u.id, emailNorm],
    );
    if (conflict.rows.length > 0) {
      console.warn("[user.email.autobind:conflict]", {
        phoneNormalized: phone,
        email: emailNorm,
        conflictingUserId: conflict.rows[0].id,
      });
      return { outcome: "skipped_conflict" as const };
    }
    await pool.query(
      `UPDATE platform_users SET email = $1, email_normalized = lower(btrim($1)), email_verified_at = NULL, updated_at = now()
       WHERE id = $2`,
      [emailNorm, u.id],
    );
    return { outcome: "applied" as const, platformUserId: u.id };
  },

  async getProfileEmailFields(platformUserId) {
    const pool = getPool();
    const result = await pool.query<{ email: string | null; email_verified_at: Date | null }>(
      "SELECT email, email_verified_at FROM platform_users WHERE id = $1",
      [platformUserId],
    );
    if (result.rows.length === 0) {
      return { email: null, emailVerifiedAt: null };
    }
    const row = result.rows[0];
    return {
      email: row.email,
      emailVerifiedAt: row.email_verified_at ? row.email_verified_at.toISOString() : null,
    };
  },

  async patchAdminClientProfile({ platformUserId, patch }) {
    const pool = getPool();
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [];
    let n = 0;

    if (patch.displayName !== undefined) {
      n += 1;
      sets.push(`display_name = $${n}`);
      vals.push(patch.displayName);
    }
    if (patch.firstName !== undefined) {
      n += 1;
      sets.push(`first_name = $${n}`);
      vals.push(patch.firstName);
    }
    if (patch.lastName !== undefined) {
      n += 1;
      sets.push(`last_name = $${n}`);
      vals.push(patch.lastName);
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
      return { ok: false as const, reason: "nothing_to_update" as const };
    }

    n += 1;
    const idPlaceholder = n;
    vals.push(platformUserId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE platform_users SET ${sets.join(", ")}
         WHERE id = $${idPlaceholder}::uuid AND role = 'client' AND merged_into_id IS NULL`,
        vals,
      );

      if ((result.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return { ok: false as const, reason: "not_found_or_not_client" as const };
      }

      if (patch.phoneNormalized !== undefined) {
        const pn =
          patch.phoneNormalized != null && String(patch.phoneNormalized).trim().length > 0
            ? String(patch.phoneNormalized).trim()
            : null;
        await applyPlatformUserPhoneHistoryTransition(client, {
          platformUserId,
          newPhoneNormalized: pn,
          source: "admin",
        });
      }

      await client.query("COMMIT");
      return { ok: true as const };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};

export const inMemoryUserProjectionPort: UserProjectionPort = {
  upsertFromProjection: async () => ({ platformUserId: "" }),
  ensureClientFromAppointmentProjection: async () => ({ platformUserId: "" }),
  findByIntegratorId: async () => null,
  updatePhone: async () => {},
  updateDisplayName: async () => {},
  updateProfileByPhone: async () => {},
  upsertNotificationTopics: async () => {},
  updateRole: async () => {},
  getProfileEmailFields: async () => ({ email: null, emailVerifiedAt: null }),
  applyRubitimeEmailAutobind: async () => ({ outcome: "skipped_no_user" as const }),
  patchAdminClientProfile: async () => ({ ok: true as const }),
};
