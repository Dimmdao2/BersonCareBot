import type { QueryResultRow } from "pg";
import { mergeLogger as logger } from "./mergeLogger.js";
import type { ManualMergeResolution } from "./manualMergeResolution.js";
import { assertManualMergeResolutionIds } from "./manualMergeResolution.js";
import {
  collectMergeLosingContacts,
  persistMergeLosingContacts,
  pruneIdentityPlatformUserContactsAfterMerge,
  repointPlatformUserContactsForMerge,
  type MergeContactsSaved,
} from "./mergeContactFallback.js";
import { MergeConflictError, MergeDependentConflictError } from "./platformUserMergeErrors.js";
import { TrustedPatientPhoneSource, trustedPatientPhoneWriteAnchor } from "./trustedPhoneAnchor.js";

/**
 * Minimal DB surface for merge (`pg` pool/transaction client, integrator `DbPort` inside `tx`).
 */
export type PlatformMergeDbClient = {
  query<R extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount?: number }>;
};

export type MergePlatformUsersReason = "projection" | "phone_bind" | "manual";

export type { MergeContactsSaved } from "./mergeContactFallback.js";

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

export type PickMergeTargetCandidate = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  created_at: Date;
  /** Количество строк `patient_bookings` для канона — выше приоритет как merge target (native bookings). */
  patientBookingCount?: number;
};

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

const SINGLETON_SYMPTOM_KEYS = ["general_wellbeing", "warmup_feeling"] as const;

/**
 * Before bulk reassignment of `symptom_trackings.platform_user_id`, collapse duplicate singleton
 * diary trackings (partial unique per `platform_user_id` + `symptom_key`) so the follow-up UPDATE
 * cannot violate `uq_symptom_trackings_*_active_platform_user`.
 */
async function dedupeSingletonSymptomTrackingsForMerge(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
  symptomKey: (typeof SINGLETON_SYMPTOM_KEYS)[number],
): Promise<void> {
  await client.query(
    `WITH tgt AS (
       SELECT id FROM symptom_trackings
       WHERE symptom_key = $5::text
         AND deleted_at IS NULL
         AND (platform_user_id = $1::uuid OR user_id = $2::text)
       ORDER BY created_at ASC, id ASC
       LIMIT 1
     ),
     dup AS (
       SELECT id FROM symptom_trackings
       WHERE symptom_key = $5::text
         AND deleted_at IS NULL
         AND (platform_user_id = $3::uuid OR user_id = $4::text)
     )
     UPDATE symptom_entries e
     SET tracking_id = (SELECT id FROM tgt)
     FROM dup
     WHERE e.tracking_id = dup.id
       AND EXISTS (SELECT 1 FROM tgt)
       AND dup.id IS DISTINCT FROM (SELECT id FROM tgt)`,
    [targetId, targetId, duplicateId, duplicateId, symptomKey],
  );

  await client.query(
    `WITH tgt AS (
       SELECT id FROM symptom_trackings
       WHERE symptom_key = $5::text
         AND deleted_at IS NULL
         AND (platform_user_id = $1::uuid OR user_id = $2::text)
       ORDER BY created_at ASC, id ASC
       LIMIT 1
     ),
     dup AS (
       SELECT id FROM symptom_trackings
       WHERE symptom_key = $5::text
         AND deleted_at IS NULL
         AND (platform_user_id = $3::uuid OR user_id = $4::text)
     )
     UPDATE symptom_trackings st
     SET is_active = false, deleted_at = now(), updated_at = now()
     FROM dup
     WHERE st.id = dup.id
       AND EXISTS (SELECT 1 FROM tgt)
       AND dup.id IS DISTINCT FROM (SELECT id FROM tgt)`,
    [targetId, targetId, duplicateId, duplicateId, symptomKey],
  );
}

/**
 * Merge duplicate platform user into canonical target inside an open transaction.
 * Caller must BEGIN; this function does not COMMIT.
 * Requires migration 061 (DEFERRABLE unique on phone + integrator_user_id).
 */
export async function mergePlatformUsersInTransaction(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
  reason: MergePlatformUsersReason,
  options?: {
    resolution?: ManualMergeResolution;
    allowDistinctIntegratorUserIds?: boolean;
    verifiedDistinctIntegratorUserIds?: VerifiedDistinctIntegratorUserIds;
  },
): Promise<{ targetId: string; duplicateId: string; mergeContactsSaved: MergeContactsSaved[] }> {
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
  let iA = a.integrator_user_id?.trim() || null;
  let iB = b.integrator_user_id?.trim() || null;

  /**
   * Channel-link / phone_bind: поглощаем «stub» без телефона, у которого уже есть integrator_user_id
   * из мессенджера (другой id, чем у аккаунта с телефоном). Иначе merge блокируется, хотя COALESCE в UPDATE
   * оставил бы id канонического аккаунта.
   */
  if (
    reason === "phone_bind" &&
    !manualResolution &&
    pA &&
    !pB &&
    iA &&
    iB &&
    iA !== iB
  ) {
    await client.query(
      `UPDATE platform_users SET integrator_user_id = NULL, updated_at = now() WHERE id = $1::uuid`,
      [duplicateId],
    );
    iB = null;
    logger.info({
      scope: "platform_merge",
      event: "phone_bind_drop_duplicate_integrator_user_id",
      targetId,
      duplicateId,
    });
  }

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
  await assertActiveTreatmentProgramInstancesSafe(client, targetId, duplicateId);
  await assertOpenTestAttemptsSafe(client, targetId, duplicateId);

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
    `INSERT INTO user_notification_topic_channels (user_id, topic_code, channel_code, is_enabled, updated_at)
     SELECT $1::uuid, topic_code, channel_code, is_enabled, updated_at
     FROM user_notification_topic_channels WHERE user_id = $2::uuid
     ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE SET
       is_enabled = CASE
         WHEN EXCLUDED.updated_at >= user_notification_topic_channels.updated_at THEN EXCLUDED.is_enabled
         ELSE user_notification_topic_channels.is_enabled
       END,
       updated_at = GREATEST(user_notification_topic_channels.updated_at, EXCLUDED.updated_at)`,
    [targetId, duplicateId],
  );
  await client.query(`DELETE FROM user_notification_topic_channels WHERE user_id = $1::uuid`, [duplicateId]);

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
    `UPDATE appointment_records SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
    [targetId, duplicateId],
  );
  await client.query(
    `UPDATE user_phone_history SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
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

  const pwTarget = await client.query(`SELECT 1 FROM user_password_credentials WHERE user_id = $1::uuid LIMIT 1`, [
    targetId,
  ]);
  const pwDup = await client.query(`SELECT 1 FROM user_password_credentials WHERE user_id = $1::uuid LIMIT 1`, [
    duplicateId,
  ]);
  if (pwTarget.rows.length === 0 && pwDup.rows.length > 0) {
    await client.query(`UPDATE user_password_credentials SET user_id = $1::uuid WHERE user_id = $2::uuid`, [
      targetId,
      duplicateId,
    ]);
  } else {
    await client.query(`DELETE FROM user_password_credentials WHERE user_id = $1::uuid`, [duplicateId]);
  }

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

  for (const sk of SINGLETON_SYMPTOM_KEYS) {
    await dedupeSingletonSymptomTrackingsForMerge(client, targetId, duplicateId, sk);
  }

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

  await client.query(`UPDATE media_files SET uploaded_by = $1::uuid WHERE uploaded_by = $2::uuid`, [
    targetId,
    duplicateId,
  ]);
  await client.query(`UPDATE media_upload_sessions SET owner_user_id = $1::uuid WHERE owner_user_id = $2::uuid`, [
    targetId,
    duplicateId,
  ]);

  await mergeExtendedUserOwnedData(client, targetId, duplicateId);

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
           THEN COALESCE(NULLIF(trim(pu.display_name), ''), NULLIF(trim(dup.display_name), ''), '')
           WHEN NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NULL
           THEN COALESCE(NULLIF(trim(dup.display_name), ''), NULLIF(trim(pu.display_name), ''), '')
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND pu.phone_normalized IS NOT DISTINCT FROM dup.phone_normalized
           THEN COALESCE(
             NULLIF(trim(CASE WHEN pu.created_at <= dup.created_at THEN pu.display_name ELSE dup.display_name END), ''),
             NULLIF(trim(CASE WHEN pu.created_at <= dup.created_at THEN dup.display_name ELSE pu.display_name END), ''),
             ''
           )
           ELSE COALESCE(NULLIF(trim(pu.display_name), ''), NULLIF(trim(dup.display_name), ''), '')
         END,
         first_name = CASE
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NULL
           THEN CASE
             WHEN (NULLIF(trim(pu.first_name), '') IS NOT NULL AND NULLIF(trim(pu.last_name), '') IS NOT NULL)
              AND NOT (NULLIF(trim(dup.first_name), '') IS NOT NULL AND NULLIF(trim(dup.last_name), '') IS NOT NULL)
             THEN COALESCE(NULLIF(trim(pu.first_name), ''), NULLIF(trim(dup.first_name), ''))
             WHEN (NULLIF(trim(dup.first_name), '') IS NOT NULL AND NULLIF(trim(dup.last_name), '') IS NOT NULL)
              AND NOT (NULLIF(trim(pu.first_name), '') IS NOT NULL AND NULLIF(trim(pu.last_name), '') IS NOT NULL)
             THEN COALESCE(NULLIF(trim(dup.first_name), ''), NULLIF(trim(pu.first_name), ''))
             ELSE COALESCE(NULLIF(trim(pu.first_name), ''), NULLIF(trim(dup.first_name), ''))
           END
           WHEN NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NULL
           THEN CASE
             WHEN (NULLIF(trim(dup.first_name), '') IS NOT NULL AND NULLIF(trim(dup.last_name), '') IS NOT NULL)
              AND NOT (NULLIF(trim(pu.first_name), '') IS NOT NULL AND NULLIF(trim(pu.last_name), '') IS NOT NULL)
             THEN COALESCE(NULLIF(trim(dup.first_name), ''), NULLIF(trim(pu.first_name), ''))
             WHEN (NULLIF(trim(pu.first_name), '') IS NOT NULL AND NULLIF(trim(pu.last_name), '') IS NOT NULL)
              AND NOT (NULLIF(trim(dup.first_name), '') IS NOT NULL AND NULLIF(trim(dup.last_name), '') IS NOT NULL)
             THEN COALESCE(NULLIF(trim(pu.first_name), ''), NULLIF(trim(dup.first_name), ''))
             ELSE COALESCE(NULLIF(trim(dup.first_name), ''), NULLIF(trim(pu.first_name), ''))
           END
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND pu.phone_normalized IS NOT DISTINCT FROM dup.phone_normalized
           THEN CASE
             WHEN pu.created_at <= dup.created_at THEN COALESCE(NULLIF(trim(pu.first_name), ''), NULLIF(trim(dup.first_name), ''))
             ELSE COALESCE(NULLIF(trim(dup.first_name), ''), NULLIF(trim(pu.first_name), ''))
           END
           ELSE COALESCE(NULLIF(trim(pu.first_name), ''), NULLIF(trim(dup.first_name), ''))
         END,
         last_name = CASE
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NULL
           THEN CASE
             WHEN (NULLIF(trim(pu.first_name), '') IS NOT NULL AND NULLIF(trim(pu.last_name), '') IS NOT NULL)
              AND NOT (NULLIF(trim(dup.first_name), '') IS NOT NULL AND NULLIF(trim(dup.last_name), '') IS NOT NULL)
             THEN COALESCE(NULLIF(trim(pu.last_name), ''), NULLIF(trim(dup.last_name), ''))
             WHEN (NULLIF(trim(dup.first_name), '') IS NOT NULL AND NULLIF(trim(dup.last_name), '') IS NOT NULL)
              AND NOT (NULLIF(trim(pu.first_name), '') IS NOT NULL AND NULLIF(trim(pu.last_name), '') IS NOT NULL)
             THEN COALESCE(NULLIF(trim(dup.last_name), ''), NULLIF(trim(pu.last_name), ''))
             ELSE COALESCE(NULLIF(trim(pu.last_name), ''), NULLIF(trim(dup.last_name), ''))
           END
           WHEN NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NULL
           THEN CASE
             WHEN (NULLIF(trim(dup.first_name), '') IS NOT NULL AND NULLIF(trim(dup.last_name), '') IS NOT NULL)
              AND NOT (NULLIF(trim(pu.first_name), '') IS NOT NULL AND NULLIF(trim(pu.last_name), '') IS NOT NULL)
             THEN COALESCE(NULLIF(trim(dup.last_name), ''), NULLIF(trim(pu.last_name), ''))
             WHEN (NULLIF(trim(pu.first_name), '') IS NOT NULL AND NULLIF(trim(pu.last_name), '') IS NOT NULL)
              AND NOT (NULLIF(trim(dup.first_name), '') IS NOT NULL AND NULLIF(trim(dup.last_name), '') IS NOT NULL)
             THEN COALESCE(NULLIF(trim(pu.last_name), ''), NULLIF(trim(dup.last_name), ''))
             ELSE COALESCE(NULLIF(trim(dup.last_name), ''), NULLIF(trim(pu.last_name), ''))
           END
           WHEN NULLIF(trim(COALESCE(pu.phone_normalized, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(dup.phone_normalized, '')), '') IS NOT NULL
            AND pu.phone_normalized IS NOT DISTINCT FROM dup.phone_normalized
           THEN CASE
             WHEN pu.created_at <= dup.created_at THEN COALESCE(NULLIF(trim(pu.last_name), ''), NULLIF(trim(dup.last_name), ''))
             ELSE COALESCE(NULLIF(trim(dup.last_name), ''), NULLIF(trim(pu.last_name), ''))
           END
           ELSE COALESCE(NULLIF(trim(pu.last_name), ''), NULLIF(trim(dup.last_name), ''))
         END,
         email = ${chosenEmailSql},
         email_verified_at = ${preservedEmailVerifiedAtSql(chosenEmailSql)},
         updated_at = now()
       FROM platform_users dup
       WHERE pu.id = $1::uuid AND dup.id = $2::uuid`,
      [targetId, duplicateId],
    );
  }

  await clearDuplicateEmailBeforeTargetNormalization(client, duplicateId);

  await client.query(
    `UPDATE platform_users SET email_normalized = CASE
       WHEN email IS NOT NULL AND btrim(email) <> '' THEN lower(btrim(email))
       ELSE NULL
     END WHERE id = $1::uuid`,
    [targetId],
  );

  const mergeContactsSaved = await persistMergeLosingContacts(
    client,
    targetId,
    collectMergeLosingContacts(a, b, manualResolution),
  );
  await pruneIdentityPlatformUserContactsAfterMerge(client, targetId);

  await client.query(
    `UPDATE platform_users SET
       phone_normalized = NULL,
       integrator_user_id = NULL,
       merged_into_id = $1::uuid,
       merged_at = now(),
       updated_at = now()
     WHERE id = $2::uuid`,
    [targetId, duplicateId],
  );

  logger.info({ targetId, duplicateId, reason, mergeContactsSaved }, "[merge] merged duplicate into target");
  trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.PlatformUserMerge);
  return { targetId, duplicateId, mergeContactsSaved };
}

/**
 * Все строки `user_channel_bindings` дубликата → цель. Нельзя INSERT+ON CONFLICT DO NOTHING:
 * глобальный UNIQUE(channel_code, external_id) уже удерживается строкой дубликата.
 */
async function reassignAllUserChannelBindingsFromDuplicate(
  client: PlatformMergeDbClient,
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
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  await client.query(`UPDATE user_oauth_bindings SET user_id = $1::uuid WHERE user_id = $2::uuid`, [
    targetId,
    duplicateId,
  ]);
}

async function mergeChannelBindingsAuto(client: PlatformMergeDbClient, targetId: string, duplicateId: string): Promise<void> {
  await reassignAllUserChannelBindingsFromDuplicate(client, targetId, duplicateId);
  await client.query(`DELETE FROM user_channel_bindings WHERE user_id = $1::uuid`, [duplicateId]);
}

async function mergeChannelBindingsManual(
  client: PlatformMergeDbClient,
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

async function mergeOauthBindingsAuto(client: PlatformMergeDbClient, targetId: string, duplicateId: string): Promise<void> {
  await reassignAllUserOauthBindingsFromDuplicate(client, targetId, duplicateId);
  await client.query(`DELETE FROM user_oauth_bindings WHERE user_id = $1::uuid`, [duplicateId]);
}

async function mergeOauthBindingsManual(
  client: PlatformMergeDbClient,
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
  client: PlatformMergeDbClient,
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
  client: PlatformMergeDbClient,
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
  client: PlatformMergeDbClient,
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
  client: PlatformMergeDbClient,
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

async function assertActiveTreatmentProgramInstancesSafe(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM treatment_program_instances t
     INNER JOIN treatment_program_instances d
       ON t.patient_user_id = $1::uuid
      AND d.patient_user_id = $2::uuid
      AND t.status = 'active'
      AND d.status = 'active'`,
    [targetId, duplicateId],
  );
  const n = parseInt(r.rows[0]?.c ?? "0", 10);
  if (n > 0) {
    throw new MergeDependentConflictError("treatment_program_instances: active program on both merge candidates", [
      targetId,
      duplicateId,
    ]);
  }
}

async function assertOpenTestAttemptsSafe(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM test_attempts t
     INNER JOIN test_attempts d
       ON t.patient_user_id = $1::uuid
      AND d.patient_user_id = $2::uuid
      AND t.submitted_at IS NULL
      AND d.submitted_at IS NULL
      AND t.instance_stage_item_id = d.instance_stage_item_id`,
    [targetId, duplicateId],
  );
  const n = parseInt(r.rows[0]?.c ?? "0", 10);
  if (n > 0) {
    throw new MergeDependentConflictError("test_attempts: open attempt conflict on same stage item", [
      targetId,
      duplicateId,
    ]);
  }
}

/**
 * Clears duplicate email before target `email_normalized` recompute so two canonical rows
 * cannot temporarily share `uq_platform_users_email_normalized_active`.
 */
async function clearDuplicateEmailBeforeTargetNormalization(
  client: PlatformMergeDbClient,
  duplicateId: string,
): Promise<void> {
  await client.query(
    `UPDATE platform_users SET email = NULL, email_normalized = NULL, updated_at = now() WHERE id = $1::uuid`,
    [duplicateId],
  );
}

/**
 * Repoint / upsert user-owned tables added in merge hardening (ratings, programs, booking-engine, analytics).
 */
async function mergeExtendedUserOwnedData(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO material_ratings (user_id, target_kind, target_id, stars, updated_at)
     SELECT $1::uuid, target_kind, target_id, stars, updated_at
     FROM material_ratings WHERE user_id = $2::uuid
     ON CONFLICT ON CONSTRAINT material_ratings_user_target_unique DO UPDATE SET
       stars = CASE
         WHEN EXCLUDED.updated_at >= material_ratings.updated_at THEN EXCLUDED.stars
         ELSE material_ratings.stars
       END,
       updated_at = GREATEST(material_ratings.updated_at, EXCLUDED.updated_at)`,
    [targetId, duplicateId],
  );
  await client.query(`DELETE FROM material_ratings WHERE user_id = $1::uuid`, [duplicateId]);

  await client.query(
    `INSERT INTO patient_daily_warmup_presentations (
       user_id, content_page_id, updated_at, last_rotation_at, skip_next_scheduled_rotation
     )
     SELECT $1::uuid, content_page_id, updated_at, last_rotation_at, skip_next_scheduled_rotation
     FROM patient_daily_warmup_presentations WHERE user_id = $2::uuid
     ON CONFLICT (user_id) DO UPDATE SET
       content_page_id = CASE
         WHEN GREATEST(
           COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at),
           COALESCE(patient_daily_warmup_presentations.last_rotation_at, patient_daily_warmup_presentations.updated_at)
         ) = COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at)
         THEN EXCLUDED.content_page_id
         ELSE patient_daily_warmup_presentations.content_page_id
       END,
       last_rotation_at = GREATEST(
         COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at),
         COALESCE(patient_daily_warmup_presentations.last_rotation_at, patient_daily_warmup_presentations.updated_at)
       ),
       skip_next_scheduled_rotation = CASE
         WHEN GREATEST(
           COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at),
           COALESCE(patient_daily_warmup_presentations.last_rotation_at, patient_daily_warmup_presentations.updated_at)
         ) = COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at)
         THEN EXCLUDED.skip_next_scheduled_rotation
         ELSE patient_daily_warmup_presentations.skip_next_scheduled_rotation
       END,
       updated_at = GREATEST(patient_daily_warmup_presentations.updated_at, EXCLUDED.updated_at)`,
    [targetId, duplicateId],
  );
  await client.query(`DELETE FROM patient_daily_warmup_presentations WHERE user_id = $1::uuid`, [duplicateId]);

  await client.query(
    `INSERT INTO be_patient_booking_profiles (
       organization_id, platform_user_id, is_problematic, booking_blocked, problematic_note, updated_at, updated_by
     )
     SELECT organization_id, $1::uuid, is_problematic, booking_blocked, problematic_note, updated_at, updated_by
     FROM be_patient_booking_profiles WHERE platform_user_id = $2::uuid
     ON CONFLICT (organization_id, platform_user_id) DO UPDATE SET
       is_problematic = CASE
         WHEN EXCLUDED.updated_at >= be_patient_booking_profiles.updated_at THEN EXCLUDED.is_problematic
         ELSE be_patient_booking_profiles.is_problematic
       END,
       booking_blocked = CASE
         WHEN EXCLUDED.updated_at >= be_patient_booking_profiles.updated_at THEN EXCLUDED.booking_blocked
         ELSE be_patient_booking_profiles.booking_blocked
       END,
       problematic_note = COALESCE(be_patient_booking_profiles.problematic_note, EXCLUDED.problematic_note),
       updated_at = GREATEST(be_patient_booking_profiles.updated_at, EXCLUDED.updated_at),
       updated_by = COALESCE(be_patient_booking_profiles.updated_by, EXCLUDED.updated_by)`,
    [targetId, duplicateId],
  );
  await client.query(`DELETE FROM be_patient_booking_profiles WHERE platform_user_id = $1::uuid`, [duplicateId]);

  await client.query(
    `INSERT INTO product_analytics_user_hourly (
       bucket_hour, user_id, entry_channel, page_key,
       app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
     )
     SELECT bucket_hour, $1::uuid, entry_channel, page_key,
            app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
     FROM product_analytics_user_hourly WHERE user_id = $2::uuid
     ON CONFLICT ON CONSTRAINT product_analytics_user_hourly_pkey DO UPDATE SET
       app_opens = product_analytics_user_hourly.app_opens + EXCLUDED.app_opens,
       page_views = product_analytics_user_hourly.page_views + EXCLUDED.page_views,
       push_opens = product_analytics_user_hourly.push_opens + EXCLUDED.push_opens,
       active_minutes = product_analytics_user_hourly.active_minutes + EXCLUDED.active_minutes,
       last_seen_at = GREATEST(product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
       updated_at = GREATEST(product_analytics_user_hourly.updated_at, EXCLUDED.updated_at)`,
    [targetId, duplicateId],
  );
  await client.query(`DELETE FROM product_analytics_user_hourly WHERE user_id = $1::uuid`, [duplicateId]);

  await client.query(
    `DELETE FROM patient_diary_day_snapshots d
     WHERE d.platform_user_id = $2::uuid
       AND EXISTS (
         SELECT 1 FROM patient_diary_day_snapshots t
         WHERE t.platform_user_id = $1::uuid AND t.local_date = d.local_date
       )`,
    [targetId, duplicateId],
  );
  await client.query(
    `UPDATE patient_diary_day_snapshots SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
    [targetId, duplicateId],
  );

  await client.query(
    `DELETE FROM webapp_reminder_occurrences d
     WHERE d.platform_user_id = $2::uuid
       AND EXISTS (
         SELECT 1 FROM webapp_reminder_occurrences t
         WHERE t.platform_user_id = $1::uuid
          AND t.integrator_rule_id = d.integrator_rule_id
          AND t.occurrence_key = d.occurrence_key
       )`,
    [targetId, duplicateId],
  );
  await client.query(
    `UPDATE webapp_reminder_occurrences SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
    [targetId, duplicateId],
  );

  await client.query(
    `DELETE FROM user_web_push_subscriptions d
     WHERE d.user_id = $2::uuid
       AND EXISTS (
         SELECT 1 FROM user_web_push_subscriptions t
         WHERE t.user_id = $1::uuid AND t.endpoint = d.endpoint
       )`,
    [targetId, duplicateId],
  );
  await client.query(`UPDATE user_web_push_subscriptions SET user_id = $1::uuid WHERE user_id = $2::uuid`, [
    targetId,
    duplicateId,
  ]);

  await client.query(
    `DELETE FROM broadcast_audit_recipients
     WHERE platform_user_id = $2::uuid
       AND audit_id IN (
         SELECT audit_id FROM broadcast_audit_recipients WHERE platform_user_id = $1::uuid
       )`,
    [targetId, duplicateId],
  );
  await client.query(
    `UPDATE broadcast_audit_recipients SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
    [targetId, duplicateId],
  );

  const simpleRepoints: Array<[string, [string, string]]> = [
    [
      `UPDATE patient_content_rating_feedback SET user_id = $1::uuid WHERE user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [`UPDATE patient_practice_completions SET user_id = $1::uuid WHERE user_id = $2::uuid`, [targetId, duplicateId]],
    [
      `UPDATE patient_daily_warmup_video_views SET user_id = $1::uuid WHERE user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [`UPDATE program_action_log SET patient_user_id = $1::uuid WHERE patient_user_id = $2::uuid`, [targetId, duplicateId]],
    [`UPDATE test_attempts SET patient_user_id = $1::uuid WHERE patient_user_id = $2::uuid`, [targetId, duplicateId]],
    [
      `UPDATE treatment_program_instances SET patient_user_id = $1::uuid WHERE patient_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [`UPDATE be_appointments SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`, [targetId, duplicateId]],
    [
      `UPDATE be_patient_timeline_events SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE be_appointment_staff_comments SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [`UPDATE be_payment_intents SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`, [targetId, duplicateId]],
    [`UPDATE be_payments SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`, [targetId, duplicateId]],
    [
      `UPDATE be_payment_history_events SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE be_product_purchases SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [`UPDATE be_patient_packages SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`, [targetId, duplicateId]],
    [`UPDATE product_push_notifications SET user_id = $1::uuid WHERE user_id = $2::uuid`, [targetId, duplicateId]],
    [`UPDATE product_analytics_events_recent SET user_id = $1::uuid WHERE user_id = $2::uuid`, [targetId, duplicateId]],
  ];
  for (const [sql, params] of simpleRepoints) {
    await client.query(sql, params);
  }

  await repointPlatformUserContactsForMerge(client, targetId, duplicateId);
}

/**
 * Загружает счётчики `patient_bookings` для пары кандидатов перед {@link pickMergeTargetId}.
 */
export async function enrichPickMergeCandidatesWithBookingCounts(
  client: PlatformMergeDbClient,
  a: PickMergeTargetCandidate,
  b: PickMergeTargetCandidate,
): Promise<[PickMergeTargetCandidate, PickMergeTargetCandidate]> {
  const r = await client.query<{ uid: string; c: string }>(
    `SELECT platform_user_id::text AS uid, COUNT(*)::text AS c
     FROM patient_bookings
     WHERE platform_user_id = ANY($1::uuid[])
     GROUP BY platform_user_id`,
    [[a.id, b.id]],
  );
  const map = new Map<string, number>();
  for (const row of r.rows) {
    map.set(row.uid, parseInt(row.c, 10));
  }
  return [
    { ...a, patientBookingCount: map.get(a.id) ?? 0 },
    { ...b, patientBookingCount: map.get(b.id) ?? 0 },
  ];
}

/**
 * Pick canonical target id from two distinct candidate ids.
 * Priority: **больше подтверждённых native-бронирований** (`patientBookingCount`) → row with phone vs without → **older created_at** → integrator id → stable id.
 */
export function pickMergeTargetId(
  a: PickMergeTargetCandidate,
  b: PickMergeTargetCandidate,
): { target: string; duplicate: string } {
  const ba = a.patientBookingCount ?? 0;
  const bb = b.patientBookingCount ?? 0;
  if (ba !== bb) {
    return ba > bb ? { target: a.id, duplicate: b.id } : { target: b.id, duplicate: a.id };
  }

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
