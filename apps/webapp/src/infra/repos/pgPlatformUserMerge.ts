import type { PoolClient } from "pg";
import { logger } from "@/infra/logging/logger";
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";
import { assertManualMergeResolutionIds } from "@/infra/repos/manualMergeResolution";
import { MergeConflictError, MergeDependentConflictError } from "@/infra/repos/platformUserMergeErrors";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";

export type MergePlatformUsersReason = "projection" | "phone_bind" | "manual";

export type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";

export type VerifiedDistinctIntegratorUserIds = {
  targetIntegratorUserId: string;
  duplicateIntegratorUserId: string;
};

const CHANNEL_CODES = ["telegram", "max", "vk"] as const;

/** Сравнение UUID из PostgreSQL (::text) и из сессии/запроса (регистр, дефисы). */
function uuidTextEquals(a: string, b: string): boolean {
  return a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
}

type OauthRow = {
  user_id: string;
  provider: string;
  provider_user_id: string;
  email: string | null;
  created_at: Date;
};

type PuRow = {
  id: string;
  phone_normalized: string | null;
  patient_phone_trust_at: Date | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_verified_at: Date | null;
  role: string;
  created_at: Date;
};

export type PickMergeTargetCandidate = Pick<PuRow, "id" | "phone_normalized" | "integrator_user_id" | "created_at">;

function preservedEmailVerifiedAtSql(chosenEmailSql: string): string {
  return `CASE
            WHEN trim(COALESCE(${chosenEmailSql}, '')) = '' THEN NULL
            ELSE COALESCE(
              CASE
                WHEN pu.email IS NOT NULL AND lower(trim(pu.email)) = lower(trim(${chosenEmailSql}))
                THEN pu.email_verified_at
                ELSE NULL
              END,
              CASE
                WHEN dup.email IS NOT NULL AND lower(trim(dup.email)) = lower(trim(${chosenEmailSql}))
                THEN dup.email_verified_at
                ELSE NULL
              END
            )
          END`;
}

/**
 * Merge duplicate platform user into canonical target inside an open transaction.
 * Caller must BEGIN; this function does not COMMIT.
 * Requires migration 061 (DEFERRABLE unique on phone + integrator_user_id).
 */
export async function mergePlatformUsersInTransaction(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
  reason: MergePlatformUsersReason,
  options?: {
    resolution?: ManualMergeResolution;
    allowDistinctIntegratorUserIds?: boolean;
    verifiedDistinctIntegratorUserIds?: VerifiedDistinctIntegratorUserIds;
  },
): Promise<{ targetId: string; duplicateId: string }> {
  if (targetId === duplicateId) {
    throw new MergeConflictError("merge: target and duplicate are the same id", [targetId]);
  }

  if (reason === "manual") {
    if (!options?.resolution) {
      throw new MergeConflictError('merge: reason "manual" requires options.resolution', [targetId, duplicateId]);
    }
    assertManualMergeResolutionIds(options.resolution);
    if (options.resolution.targetId !== targetId || options.resolution.duplicateId !== duplicateId) {
      throw new MergeConflictError("merge: resolution targetId/duplicateId mismatch", [targetId, duplicateId]);
    }
  } else if (options?.resolution) {
    throw new MergeConflictError("merge: resolution is only valid for reason manual", [targetId, duplicateId]);
  }

  await client.query(
    `SET CONSTRAINTS platform_users_phone_normalized_key, platform_users_integrator_user_id_key DEFERRED`,
  );

  const lockRes = await client.query<PuRow>(
    `SELECT id, phone_normalized, patient_phone_trust_at, integrator_user_id::text AS integrator_user_id, merged_into_id,
            display_name, first_name, last_name, email, email_verified_at, role, created_at
     FROM platform_users
     WHERE id IN ($1::uuid, $2::uuid)
     ORDER BY id
     FOR UPDATE`,
    [targetId, duplicateId],
  );
  if (lockRes.rows.length !== 2) {
    throw new MergeConflictError("merge: target or duplicate platform_users row missing", [targetId, duplicateId]);
  }
  const a = lockRes.rows.find((r) => r.id === targetId);
  const b = lockRes.rows.find((r) => r.id === duplicateId);
  if (!a || !b) throw new MergeConflictError("merge: row load mismatch", [targetId, duplicateId]);

  if (b.merged_into_id != null) {
    throw new MergeConflictError("merge: duplicate already merged", [targetId, duplicateId]);
  }
  if (a.merged_into_id != null) {
    throw new MergeConflictError("merge: target is not canonical (has merged_into_id)", [targetId, duplicateId]);
  }
  if (a.role !== "client" || b.role !== "client") {
    throw new MergeConflictError("merge: only role=client users can be merged", [targetId, duplicateId]);
  }

  const manualResolution = reason === "manual" ? options!.resolution! : undefined;

  const pA = a.phone_normalized?.trim() || null;
  const pB = b.phone_normalized?.trim() || null;
  if (!manualResolution && pA && pB && pA !== pB) {
    throw new MergeConflictError("merge: two different non-null phone numbers", [targetId, duplicateId]);
  }
  const iA = a.integrator_user_id?.trim() || null;
  const iB = b.integrator_user_id?.trim() || null;
  if (iA && iB && iA !== iB) {
    const relaxed =
      reason === "manual" &&
      Boolean(options?.resolution) &&
      options?.allowDistinctIntegratorUserIds === true;
    if (!relaxed) {
      throw new MergeConflictError("merge: two different non-null integrator_user_id", [targetId, duplicateId]);
    }
    const verified = options?.verifiedDistinctIntegratorUserIds;
    if (
      !verified ||
      verified.targetIntegratorUserId !== iA ||
      verified.duplicateIntegratorUserId !== iB
    ) {
      throw new MergeConflictError("merge: integrator ids changed since gate", [targetId, duplicateId]);
    }
  }

  await assertSharedPhoneGuard(client, targetId, duplicateId, pA, pB);
  await assertPatientBookingsSafeToMerge(client, targetId, duplicateId);
  await assertPatientLfkAssignmentsSafe(client, targetId, duplicateId);

  if (manualResolution) {
    await mergeChannelBindingsManual(client, targetId, duplicateId, manualResolution);
  } else {
    await mergeChannelBindingsAuto(client, targetId, duplicateId);
  }

  await client.query(
    `INSERT INTO user_notification_topics (user_id, topic_code, is_enabled, updated_at)
     SELECT $1::uuid, topic_code, is_enabled, updated_at
     FROM user_notification_topics WHERE user_id = $2::uuid
     ON CONFLICT (user_id, topic_code) DO UPDATE SET
       is_enabled = CASE
         WHEN EXCLUDED.updated_at >= user_notification_topics.updated_at THEN EXCLUDED.is_enabled
         ELSE user_notification_topics.is_enabled
       END,
       updated_at = GREATEST(user_notification_topics.updated_at, EXCLUDED.updated_at)`,
    [targetId, duplicateId],
  );
  await client.query(`DELETE FROM user_notification_topics WHERE user_id = $1::uuid`, [duplicateId]);

  await client.query(
    `UPDATE support_conversations SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
    [targetId, duplicateId],
  );
  await client.query(
    `UPDATE reminder_rules SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
    [targetId, duplicateId],
  );
  await client.query(
    `UPDATE content_access_grants_webapp SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
    [targetId, duplicateId],
  );
  await client.query(`UPDATE doctor_notes SET user_id = $1::uuid WHERE user_id = $2::uuid`, [targetId, duplicateId]);

  await client.query(
    `UPDATE patient_bookings SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
    [targetId, duplicateId],
  );
  await client.query(
    `UPDATE online_intake_requests SET user_id = $1::uuid WHERE user_id = $2::uuid`,
    [targetId, duplicateId],
  );

  await client.query(
    `UPDATE patient_lfk_assignments SET patient_user_id = $1::uuid WHERE patient_user_id = $2::uuid`,
    [targetId, duplicateId],
  );

  if (manualResolution) {
    await mergeOauthBindingsManual(client, targetId, duplicateId, manualResolution);
  } else {
    await mergeOauthBindingsAuto(client, targetId, duplicateId);
  }

  const pinTarget = await client.query(`SELECT 1 FROM user_pins WHERE user_id = $1::uuid LIMIT 1`, [targetId]);
  const pinDup = await client.query(`SELECT 1 FROM user_pins WHERE user_id = $1::uuid LIMIT 1`, [duplicateId]);
  if (pinTarget.rows.length === 0 && pinDup.rows.length > 0) {
    await client.query(`UPDATE user_pins SET user_id = $1::uuid WHERE user_id = $2::uuid`, [targetId, duplicateId]);
  } else {
    await client.query(`DELETE FROM user_pins WHERE user_id = $1::uuid`, [duplicateId]);
  }

  await client.query(
    `UPDATE channel_link_secrets SET user_id = $1::uuid WHERE user_id = $2::uuid`,
    [targetId, duplicateId],
  );
  await client.query(`UPDATE email_challenges SET user_id = $1::uuid WHERE user_id = $2::uuid`, [targetId, duplicateId]);
  await client.query(
    `INSERT INTO email_send_cooldowns (user_id, email_normalized, last_sent_at)
     SELECT $1::uuid, email_normalized, last_sent_at
     FROM email_send_cooldowns WHERE user_id = $2::uuid
     ON CONFLICT (user_id, email_normalized) DO UPDATE SET
       last_sent_at = GREATEST(email_send_cooldowns.last_sent_at, EXCLUDED.last_sent_at)`,
    [targetId, duplicateId],
  );
  await client.query(`DELETE FROM email_send_cooldowns WHERE user_id = $1::uuid`, [duplicateId]);

  await client.query(`DELETE FROM login_tokens WHERE user_id = $1::uuid`, [duplicateId]);

  await mergeUserChannelPreferences(client, targetId, duplicateId, manualResolution?.channelPreferences ?? "keep_newer");

  // PG cannot infer one type for the same $n used as both ::text and ::uuid — use distinct placeholders.
  await client.query(
    `UPDATE symptom_trackings SET user_id = $1::text, platform_user_id = $2::uuid
     WHERE user_id = $3::text OR platform_user_id = $4::uuid`,
    [targetId, targetId, duplicateId, duplicateId],
  );
  await client.query(
    `UPDATE symptom_entries SET user_id = $1::text, platform_user_id = $2::uuid
     WHERE user_id = $3::text OR platform_user_id = $4::uuid`,
    [targetId, targetId, duplicateId, duplicateId],
  );
  await client.query(
    `UPDATE lfk_complexes SET user_id = $1::text, platform_user_id = $2::uuid
     WHERE user_id = $3::text OR platform_user_id = $4::uuid`,
    [targetId, targetId, duplicateId, duplicateId],
  );
  await client.query(`UPDATE lfk_sessions SET user_id = $1::uuid WHERE user_id = $2::uuid`, [targetId, duplicateId]);

  await client.query(
    `UPDATE message_log SET user_id = $1::text, platform_user_id = $2::uuid
     WHERE user_id = $3::text OR platform_user_id = $4::uuid`,
    [targetId, targetId, duplicateId, duplicateId],
  );

  await client.query(
    `INSERT INTO news_item_views (news_id, user_id, viewed_at, platform_user_id)
     SELECT news_id, $1::text, viewed_at, $2::uuid
     FROM news_item_views
     WHERE user_id = $3::text OR platform_user_id = $4::uuid
     ON CONFLICT (news_id, user_id) DO UPDATE SET
       viewed_at = LEAST(news_item_views.viewed_at, EXCLUDED.viewed_at)`,
    [targetId, targetId, duplicateId, duplicateId],
  );
  await client.query(
    `DELETE FROM news_item_views WHERE user_id = $1::text OR platform_user_id = $2::uuid`,
    [duplicateId, duplicateId],
  );

  await client.query(`UPDATE media_files SET uploaded_by = $1::uuid WHERE uploaded_by = $2::uuid`, [
    targetId,
    duplicateId,
  ]);
  await client.query(`UPDATE media_upload_sessions SET owner_user_id = $1::uuid WHERE owner_user_id = $2::uuid`, [
    targetId,
    duplicateId,
  ]);

  if (manualResolution) {
    const f = manualResolution.fields;
    const chosenEmailSql = `CASE WHEN $7::text = 'target' THEN pu.email ELSE dup.email END`;
    await client.query(
      `UPDATE platform_users AS pu
       SET
         phone_normalized = CASE WHEN $3::text = 'target' THEN pu.phone_normalized ELSE dup.phone_normalized END,
         patient_phone_trust_at = CASE WHEN $3::text = 'target' THEN pu.patient_phone_trust_at ELSE dup.patient_phone_trust_at END,
         integrator_user_id = COALESCE(pu.integrator_user_id, dup.integrator_user_id),
         display_name = CASE WHEN $4::text = 'target' THEN pu.display_name ELSE dup.display_name END,
         first_name = CASE WHEN $5::text = 'target' THEN pu.first_name ELSE dup.first_name END,
         last_name = CASE WHEN $6::text = 'target' THEN pu.last_name ELSE dup.last_name END,
         email = ${chosenEmailSql},
         email_verified_at = ${preservedEmailVerifiedAtSql(chosenEmailSql)},
         updated_at = now()
       FROM platform_users dup
       WHERE pu.id = $1::uuid AND dup.id = $2::uuid`,
      [targetId, duplicateId, f.phone_normalized, f.display_name, f.first_name, f.last_name, f.email],
    );
  } else {
    const chosenEmailSql = `COALESCE(pu.email, dup.email)`;
    await client.query(
      `UPDATE platform_users AS pu
       SET
         phone_normalized = COALESCE(pu.phone_normalized, dup.phone_normalized),
         patient_phone_trust_at = CASE
           WHEN trim(COALESCE(pu.phone_normalized, dup.phone_normalized, '')) = '' THEN NULL
           WHEN pu.phone_normalized IS NOT NULL
             AND dup.phone_normalized IS NOT NULL
             AND pu.phone_normalized IS NOT DISTINCT FROM dup.phone_normalized
             THEN (SELECT max(v) FROM (VALUES (pu.patient_phone_trust_at), (dup.patient_phone_trust_at)) AS t(v))
           WHEN pu.phone_normalized IS NOT DISTINCT FROM COALESCE(pu.phone_normalized, dup.phone_normalized)
             THEN pu.patient_phone_trust_at
           ELSE dup.patient_phone_trust_at
         END,
         integrator_user_id = COALESCE(pu.integrator_user_id, dup.integrator_user_id),
         display_name = CASE
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NULL
           THEN CASE
             WHEN trim(COALESCE(pu.display_name, '')) <> '' THEN pu.display_name
             WHEN trim(COALESCE(dup.display_name, '')) <> '' THEN dup.display_name
             ELSE COALESCE(pu.display_name, dup.display_name, '')
           END
           WHEN NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NULL
           THEN CASE
             WHEN trim(COALESCE(dup.display_name, '')) <> '' THEN dup.display_name
             WHEN trim(COALESCE(pu.display_name, '')) <> '' THEN pu.display_name
             ELSE COALESCE(pu.display_name, dup.display_name, '')
           END
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
           THEN CASE
             WHEN pu.created_at <= dup.created_at THEN
               CASE
                 WHEN trim(COALESCE(pu.display_name, '')) <> '' THEN pu.display_name
                 WHEN trim(COALESCE(dup.display_name, '')) <> '' THEN dup.display_name
                 ELSE COALESCE(pu.display_name, dup.display_name, '')
               END
             ELSE
               CASE
                 WHEN trim(COALESCE(dup.display_name, '')) <> '' THEN dup.display_name
                 WHEN trim(COALESCE(pu.display_name, '')) <> '' THEN pu.display_name
                 ELSE COALESCE(pu.display_name, dup.display_name, '')
               END
           END
           ELSE CASE
             WHEN trim(COALESCE(dup.display_name, '')) <> ''
              AND trim(COALESCE(pu.display_name, '')) = ''
             THEN dup.display_name
             ELSE pu.display_name
           END
         END,
         first_name = CASE
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NULL
           THEN COALESCE(pu.first_name, dup.first_name)
           WHEN NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NULL
           THEN COALESCE(dup.first_name, pu.first_name)
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
           THEN CASE
             WHEN pu.created_at <= dup.created_at THEN COALESCE(pu.first_name, dup.first_name)
             ELSE COALESCE(dup.first_name, pu.first_name)
           END
           ELSE COALESCE(pu.first_name, dup.first_name)
         END,
         last_name = CASE
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NULL
           THEN COALESCE(pu.last_name, dup.last_name)
           WHEN NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NULL
           THEN COALESCE(dup.last_name, pu.last_name)
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
           THEN CASE
             WHEN pu.created_at <= dup.created_at THEN COALESCE(pu.last_name, dup.last_name)
             ELSE COALESCE(dup.last_name, pu.last_name)
           END
           ELSE COALESCE(pu.last_name, dup.last_name)
         END,
         email = ${chosenEmailSql},
         email_verified_at = ${preservedEmailVerifiedAtSql(chosenEmailSql)},
         updated_at = now()
       FROM platform_users dup
       WHERE pu.id = $1::uuid AND dup.id = $2::uuid`,
      [targetId, duplicateId],
    );
  }

  await client.query(
    `UPDATE platform_users SET
       phone_normalized = NULL,
       integrator_user_id = NULL,
       merged_into_id = $1::uuid,
       updated_at = now()
     WHERE id = $2::uuid`,
    [targetId, duplicateId],
  );

  logger.info({ targetId, duplicateId, reason }, "[merge] merged duplicate into target");
  trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.PlatformUserMerge);
  return { targetId, duplicateId };
}

/**
 * Все строки `user_channel_bindings` дубликата → цель. Нельзя INSERT+ON CONFLICT DO NOTHING:
 * глобальный UNIQUE(channel_code, external_id) уже удерживается строкой дубликата.
 */
async function reassignAllUserChannelBindingsFromDuplicate(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  await client.query(`UPDATE user_channel_bindings SET user_id = $1::uuid WHERE user_id = $2::uuid`, [
    targetId,
    duplicateId,
  ]);
}

/** Все `user_oauth_bindings` дубликата → цель (UNIQUE по provider+provider_user_id). */
async function reassignAllUserOauthBindingsFromDuplicate(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  await client.query(`UPDATE user_oauth_bindings SET user_id = $1::uuid WHERE user_id = $2::uuid`, [
    targetId,
    duplicateId,
  ]);
}

async function mergeChannelBindingsAuto(client: PoolClient, targetId: string, duplicateId: string): Promise<void> {
  await reassignAllUserChannelBindingsFromDuplicate(client, targetId, duplicateId);
  await client.query(`DELETE FROM user_channel_bindings WHERE user_id = $1::uuid`, [duplicateId]);
}

async function mergeChannelBindingsManual(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
  resolution: ManualMergeResolution,
): Promise<void> {
  for (const ch of CHANNEL_CODES) {
    const winner = resolution.bindings[ch];
    if (winner === "both") {
      const bindingPresence = await client.query<{ user_id: string }>(
        `SELECT user_id::text AS user_id
         FROM user_channel_bindings
         WHERE user_id = ANY($1::uuid[]) AND channel_code = $2`,
        [[targetId, duplicateId], ch],
      );
      const hasTargetBinding = bindingPresence.rows.some((row) => uuidTextEquals(row.user_id, targetId));
      const hasDuplicateBinding = bindingPresence.rows.some((row) => uuidTextEquals(row.user_id, duplicateId));
      if (hasTargetBinding && hasDuplicateBinding) {
        throw new MergeConflictError(`manual merge: channel ${ch} conflict requires target or duplicate`, [
          targetId,
          duplicateId,
        ]);
      }
      await client.query(
        `UPDATE user_channel_bindings SET user_id = $1::uuid
         WHERE user_id = $2::uuid AND channel_code = $3`,
        [targetId, duplicateId, ch],
      );
      await client.query(
        `DELETE FROM user_channel_bindings WHERE user_id = $1::uuid AND channel_code = $2`,
        [duplicateId, ch],
      );
    } else if (winner === "target") {
      await client.query(
        `DELETE FROM user_channel_bindings WHERE user_id = $1::uuid AND channel_code = $2`,
        [duplicateId, ch],
      );
    } else {
      await client.query(
        `DELETE FROM user_channel_bindings WHERE user_id = $1::uuid AND channel_code = $2`,
        [targetId, ch],
      );
      await client.query(
        `UPDATE user_channel_bindings SET user_id = $1::uuid
         WHERE user_id = $2::uuid AND channel_code = $3`,
        [targetId, duplicateId, ch],
      );
    }
  }
  await client.query(`DELETE FROM user_channel_bindings WHERE user_id = $1::uuid`, [duplicateId]);
}

async function mergeOauthBindingsAuto(client: PoolClient, targetId: string, duplicateId: string): Promise<void> {
  await reassignAllUserOauthBindingsFromDuplicate(client, targetId, duplicateId);
  await client.query(`DELETE FROM user_oauth_bindings WHERE user_id = $1::uuid`, [duplicateId]);
}

async function mergeOauthBindingsManual(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
  resolution: ManualMergeResolution,
): Promise<void> {
  const r = await client.query<OauthRow>(
    `SELECT user_id::text AS user_id, provider, provider_user_id, email, created_at
     FROM user_oauth_bindings WHERE user_id = ANY($1::uuid[])`,
    [[targetId, duplicateId]],
  );
  const byProvider = new Map<string, OauthRow[]>();
  for (const row of r.rows) {
    const list = byProvider.get(row.provider) ?? [];
    list.push(row);
    byProvider.set(row.provider, list);
  }
  for (const [provider, rows] of byProvider) {
    const onTarget = rows.find((x) => uuidTextEquals(x.user_id, targetId));
    const onDup = rows.find((x) => uuidTextEquals(x.user_id, duplicateId));
    if (onTarget && !onDup) {
      continue;
    }
    if (!onTarget && onDup) {
      await client.query(
        `UPDATE user_oauth_bindings SET user_id = $1::uuid WHERE user_id = $2::uuid AND provider = $3`,
        [targetId, duplicateId, provider],
      );
      continue;
    }
    if (onTarget && onDup) {
      if (onTarget.provider_user_id === onDup.provider_user_id) {
        await client.query(
          `DELETE FROM user_oauth_bindings WHERE user_id = $1::uuid AND provider = $2`,
          [duplicateId, provider],
        );
        continue;
      }
      const w = resolution.oauth[provider];
      if (!w) {
        throw new MergeConflictError(`manual merge: missing oauth resolution for provider ${provider}`, [
          targetId,
          duplicateId,
        ]);
      }
      if (w === "target") {
        await client.query(
          `DELETE FROM user_oauth_bindings WHERE user_id = $1::uuid AND provider = $2`,
          [duplicateId, provider],
        );
      } else {
        await client.query(
          `DELETE FROM user_oauth_bindings WHERE user_id = $1::uuid AND provider = $2`,
          [targetId, provider],
        );
        await client.query(
          `UPDATE user_oauth_bindings SET user_id = $1::uuid WHERE user_id = $2::uuid AND provider = $3`,
          [targetId, duplicateId, provider],
        );
      }
    }
  }
  await client.query(`DELETE FROM user_oauth_bindings WHERE user_id = $1::uuid`, [duplicateId]);
}

async function mergeUserChannelPreferences(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
  strategy: "keep_target" | "keep_newer" | "merge",
): Promise<void> {
  if (strategy === "keep_target") {
    await client.query(
      `DELETE FROM user_channel_preferences
       WHERE user_id = $1::text OR platform_user_id = $2::uuid`,
      [duplicateId, duplicateId],
    );
    return;
  }

  await client.query(
    `UPDATE user_channel_preferences AS t
     SET
       is_enabled_for_messages = CASE
         WHEN d.updated_at > t.updated_at THEN d.is_enabled_for_messages
         ELSE t.is_enabled_for_messages
       END,
       is_enabled_for_notifications = CASE
         WHEN d.updated_at > t.updated_at THEN d.is_enabled_for_notifications
         ELSE t.is_enabled_for_notifications
       END,
       is_preferred_for_auth = CASE
         WHEN t.is_preferred_for_auth AND d.is_preferred_for_auth THEN t.is_preferred_for_auth
         WHEN d.updated_at > t.updated_at THEN d.is_preferred_for_auth
         ELSE t.is_preferred_for_auth
       END,
       updated_at = GREATEST(t.updated_at, d.updated_at),
       platform_user_id = $1::uuid
     FROM user_channel_preferences d
     WHERE (t.user_id = $2::text OR t.platform_user_id = $3::uuid)
       AND (d.user_id = $4::text OR d.platform_user_id = $5::uuid)
       AND t.channel_code = d.channel_code`,
    [targetId, targetId, targetId, duplicateId, duplicateId],
  );

  await client.query(
    `DELETE FROM user_channel_preferences d
     WHERE (d.user_id = $1::text OR d.platform_user_id = $2::uuid)
       AND EXISTS (
         SELECT 1 FROM user_channel_preferences t
         WHERE (t.user_id = $3::text OR t.platform_user_id = $4::uuid)
           AND t.channel_code = d.channel_code
       )`,
    [duplicateId, duplicateId, targetId, targetId],
  );

  await client.query(
    `UPDATE user_channel_preferences
     SET user_id = $1::text, platform_user_id = $2::uuid
     WHERE user_id = $3::text OR platform_user_id = $4::uuid`,
    [targetId, targetId, duplicateId, duplicateId],
  );
}

async function assertSharedPhoneGuard(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
  pA: string | null,
  pB: string | null,
): Promise<void> {
  if (!pA || !pB || pA !== pB) return;

  async function meaningfulCount(uid: string): Promise<number> {
    const q: { sql: string; params: [string] | [string, string] }[] = [
      { sql: `SELECT COUNT(*)::int AS c FROM patient_bookings WHERE platform_user_id = $1::uuid`, params: [uid] },
      { sql: `SELECT COUNT(*)::int AS c FROM doctor_notes WHERE user_id = $1::uuid`, params: [uid] },
      { sql: `SELECT COUNT(*)::int AS c FROM online_intake_requests WHERE user_id = $1::uuid`, params: [uid] },
      {
        sql: `SELECT COUNT(*)::int AS c FROM symptom_trackings WHERE platform_user_id = $1::uuid OR user_id = $2::text`,
        params: [uid, uid],
      },
      {
        sql: `SELECT COUNT(*)::int AS c FROM lfk_complexes WHERE platform_user_id = $1::uuid OR user_id = $2::text`,
        params: [uid, uid],
      },
      { sql: `SELECT COUNT(*)::int AS c FROM patient_lfk_assignments WHERE patient_user_id = $1::uuid`, params: [uid] },
      {
        sql: `SELECT COUNT(*)::int AS c FROM message_log WHERE platform_user_id = $1::uuid OR user_id = $2::text`,
        params: [uid, uid],
      },
    ];
    let sum = 0;
    for (const { sql, params } of q) {
      const r = await client.query<{ c: number }>(sql, params);
      sum += r.rows[0]?.c ?? 0;
    }
    return sum;
  }

  const [ct, cd] = await Promise.all([meaningfulCount(targetId), meaningfulCount(duplicateId)]);
  if (ct > 0 && cd > 0) {
    throw new MergeDependentConflictError("shared-phone guard: meaningful data on both candidates", [
      targetId,
      duplicateId,
    ]);
  }
}

async function assertPatientBookingsSafeToMerge(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  const overlap = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM patient_bookings pb1
     INNER JOIN patient_bookings pb2
       ON pb1.platform_user_id = $1::uuid
      AND pb2.platform_user_id = $2::uuid
      AND pb1.id <> pb2.id
      AND tstzrange(pb1.slot_start, pb1.slot_end, '[)') && tstzrange(pb2.slot_start, pb2.slot_end, '[)')
      AND pb1.status IN ('confirmed', 'rescheduled', 'creating', 'cancelling', 'cancel_failed')
      AND pb2.status IN ('confirmed', 'rescheduled', 'creating', 'cancelling', 'cancel_failed')
      AND (
        (pb1.rubitime_cooperator_id_snapshot IS NOT NULL AND pb1.rubitime_cooperator_id_snapshot = pb2.rubitime_cooperator_id_snapshot)
        OR (pb1.rubitime_cooperator_id_snapshot IS NULL AND pb2.rubitime_cooperator_id_snapshot IS NULL)
      )`,
    [targetId, duplicateId],
  );
  const n = parseInt(overlap.rows[0]?.c ?? "0", 10);
  if (n > 0) {
    throw new MergeDependentConflictError("patient_bookings: overlapping active slots between merge candidates", [
      targetId,
      duplicateId,
    ]);
  }
}

async function assertPatientLfkAssignmentsSafe(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM patient_lfk_assignments a
     INNER JOIN patient_lfk_assignments b
       ON a.patient_user_id = $1::uuid
      AND b.patient_user_id = $2::uuid
      AND a.template_id = b.template_id
      AND a.is_active = true
      AND b.is_active = true`,
    [targetId, duplicateId],
  );
  const n = parseInt(r.rows[0]?.c ?? "0", 10);
  if (n > 0) {
    throw new MergeDependentConflictError("patient_lfk_assignments: active template conflict", [targetId, duplicateId]);
  }
}

/**
 * Pick canonical target id from two distinct candidate ids.
 * Priority: row with phone vs without → **older created_at** (Rubitime / CRM row before bot stub) → integrator id → stable id.
 * Older `created_at` avoids choosing a newer bot-linked row over an existing phone client when both share the same number.
 */
export function pickMergeTargetId(
  a: PickMergeTargetCandidate,
  b: PickMergeTargetCandidate,
): { target: string; duplicate: string } {
  const hasPhone = (r: PickMergeTargetCandidate) => (r.phone_normalized?.trim() ? 1 : 0);
  const pa = hasPhone(a);
  const pb = hasPhone(b);
  if (pa !== pb) {
    return pa > pb ? { target: a.id, duplicate: b.id } : { target: b.id, duplicate: a.id };
  }

  const ca = a.created_at.getTime();
  const cb = b.created_at.getTime();
  if (ca !== cb) {
    return ca < cb ? { target: a.id, duplicate: b.id } : { target: b.id, duplicate: a.id };
  }

  const ia = a.integrator_user_id?.trim() ? 1 : 0;
  const ib = b.integrator_user_id?.trim() ? 1 : 0;
  if (ia !== ib) {
    return ia > ib ? { target: a.id, duplicate: b.id } : { target: b.id, duplicate: a.id };
  }

  return a.id <= b.id ? { target: a.id, duplicate: b.id } : { target: b.id, duplicate: a.id };
}
