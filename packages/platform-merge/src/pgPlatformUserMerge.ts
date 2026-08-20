import type { QueryResultRow } from 'pg';
import { sql, type SQL } from 'drizzle-orm';
import { mergeLogger as logger } from './mergeLogger.js';
import { runMergeSql, runMergePgText } from './mergeSql.js';
import { syncUserContactsMirror, clearDuplicateUserContactsBeforeTargetMirror } from './userContactsMirrorWrite.js';
import { syncUserIdentityFioMirror } from './userIdentityFioWrite.js';
import type { ManualMergeResolution } from './manualMergeResolution.js';
import { assertManualMergeResolutionIds } from './manualMergeResolution.js';
import {
  collectMergeLosingContacts,
  persistMergeLosingContacts,
  pruneIdentityPlatformUserContactsAfterMerge,
  repointPlatformUserContactsForMerge,
  type MergeContactsSaved,
} from './mergeContactFallback.js';
import { MergeConflictError, MergeDependentConflictError } from './platformUserMergeErrors.js';
import { TrustedPatientPhoneSource, trustedPatientPhoneWriteAnchor } from './trustedPhoneAnchor.js';

/**
 * Minimal DB surface for merge (`pg` pool/transaction client, integrator `DbPort` inside `tx`).
 */
export type PlatformMergeDbClient = {
  query<R extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount?: number }>;
};

export type MergePlatformUsersReason = 'projection' | 'phone_bind' | 'email_bind' | 'manual';

export type { MergeContactsSaved } from './mergeContactFallback.js';

export type VerifiedDistinctIntegratorUserIds = {
  targetIntegratorUserId: string;
  duplicateIntegratorUserId: string;
};

/**
 * Owner rule D26 §5.2: automatic merge is only safe for an account with no
 * clinical history.  Manual support merge is intentionally excluded: support
 * is the only actor allowed to move a real history.
 */
type MedicalHistoryRecord = {
  automaticProbe?: (accountIds: readonly string[]) => SQL;
  transfer: (targetId: string, duplicateId: string) => SQL[];
};

/**
 * D26 §5.2 / §5.8: one definition of patient medical history. Automatic merges
 * probe every applicable row for both accounts; manual support merges transfer
 * the same rows (plus the clinic link that makes the history reachable).
 */
const MEDICAL_HISTORY_RECORDS: readonly MedicalHistoryRecord[] = [
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM clinical_visit WHERE patient_user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE clinical_visit SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM clinical_complaint WHERE patient_user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE clinical_complaint SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM clinical_diagnosis WHERE patient_user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE clinical_diagnosis SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM clinical_anamnesis_trauma WHERE patient_user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE clinical_anamnesis_trauma SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM clinical_anamnesis_illness WHERE patient_user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE clinical_anamnesis_illness SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM clinical_anamnesis_lifestyle WHERE patient_user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE clinical_anamnesis_lifestyle SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) => sql`SELECT 1 FROM doctor_notes WHERE user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE doctor_notes SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM patient_bookings WHERE platform_user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE patient_bookings SET platform_user_id = ${targetId}::uuid WHERE platform_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM be_appointments WHERE platform_user_id = ANY(${ids}::uuid[])`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE be_appointments SET platform_user_id = ${targetId}::uuid WHERE platform_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    automaticProbe: (ids) =>
      sql`SELECT 1 FROM treatment_program_instances
          WHERE patient_user_id = ANY(${ids}::uuid[]) AND assignment_source = 'doctor'`,
    transfer: (targetId, duplicateId) => [
      sql`UPDATE treatment_program_instances SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    // Переписка — НЕ конфликтная категория (владелец 20.08, дословно: «я бы сводил… смержить сообщения —
    // это не должно конфликтовать, а вот смержить программы и журналы выполнения — это конфликт»).
    // automaticProbe намеренно отсутствует: гейт эту таблицу не проверяет, сообщения переносятся
    // transfer'ом безусловно при любом merge (auto и manual) — см. transferMedicalHistoryForMerge ниже.
    transfer: (targetId, duplicateId) => [
      sql`UPDATE support_conversations SET platform_user_id = ${targetId}::uuid WHERE platform_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    // Та же логика: обсуждение программы — переписка, не конфликтная категория, гейт её не проверяет.
    transfer: (targetId, duplicateId) => [
      sql`DELETE FROM program_item_discussion_reads duplicate
          WHERE duplicate.patient_user_id = ${duplicateId}::uuid
            AND EXISTS (
              SELECT 1 FROM program_item_discussion_reads target
              WHERE target.patient_user_id = ${targetId}::uuid
                AND target.instance_stage_item_id = duplicate.instance_stage_item_id
            )`,
      sql`UPDATE program_item_discussion_reads SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
      sql`UPDATE program_item_discussion_messages SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
  {
    transfer: (targetId, duplicateId) => [
      sql`UPDATE patient_specialist_links duplicate
          SET status = 'ended', ended_at = now(), ended_reason = 'transferred_out'
          WHERE duplicate.patient_user_id = ${duplicateId}::uuid
            AND duplicate.status = 'active'
            AND EXISTS (
              SELECT 1 FROM patient_specialist_links target
              WHERE target.patient_user_id = ${targetId}::uuid
                AND target.specialist_id = duplicate.specialist_id
                AND target.status = 'active'
            )`,
      sql`UPDATE patient_specialist_links SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
    ],
  },
];

async function assertAutomaticMergeHasNoMedicalHistory(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  // D26 §5.2/§5.4 (владелец 20.08, финальная формулировка после серии уточнений): блок только при
  // РЕАЛЬНОМ КОНФЛИКТЕ — когда квалифицирующие медицинские данные (визиты, записи/приёмы, мед.карточки,
  // назначенные врачом программы — записи ниже с automaticProbe) есть У ОБЕИХ сторон пары одновременно.
  // Если данные есть только у одной стороны (не важно, у target или у duplicate) — блокировать нечего:
  // «зачем блокировать мерж, если только один аккаунт с данными и оба контакта подтверждены» — это
  // штатный сценарий (вернувшийся пациент добавляет новый канал), и transferMedicalHistoryForMerge ниже
  // спокойно переносит историю duplicate→target, как при любом merge. Переписка (чат/обсуждения) в этот
  // список не входит вообще — у её записей automaticProbe нет, гейт её не касается.
  const probesFor = (id: string) =>
    MEDICAL_HISTORY_RECORDS.flatMap((record) => (record.automaticProbe ? [record.automaticProbe([id])] : []));
  const result = await runMergeSql<{ target_has: boolean; duplicate_has: boolean }>(
    client,
    sql`SELECT
          EXISTS (${sql.join(probesFor(targetId), sql` UNION ALL `)}) AS target_has,
          EXISTS (${sql.join(probesFor(duplicateId), sql` UNION ALL `)}) AS duplicate_has`,
  );
  const row = result.rows[0];
  if (row?.target_has && row?.duplicate_has) {
    throw new MergeDependentConflictError(
      'medical_history: automatic merge requires support (conflict on both sides)',
      [targetId, duplicateId],
    );
  }
}

async function transferMedicalHistoryForMerge(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  for (const record of MEDICAL_HISTORY_RECORDS) {
    for (const transfer of record.transfer(targetId, duplicateId)) {
      await runMergeSql(client, transfer);
    }
  }
}

const CHANNEL_CODES = ['telegram', 'max', 'vk'] as const;

/** Сравнение UUID из PostgreSQL (::text) и из сессии/запроса (регистр, дефисы). */
function uuidTextEquals(a: string, b: string): boolean {
  return a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase();
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
  patronymic: string | null;
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

const SINGLETON_SYMPTOM_KEYS = ['general_wellbeing', 'warmup_feeling'] as const;

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
  await runMergeSql(
    client,
    sql`WITH tgt AS (
       SELECT id FROM symptom_trackings
       WHERE symptom_key = ${symptomKey}::text
         AND deleted_at IS NULL
         AND (platform_user_id = ${targetId}::uuid OR user_id = ${targetId}::text)
       ORDER BY created_at ASC, id ASC
       LIMIT 1
     ),
     dup AS (
       SELECT id FROM symptom_trackings
       WHERE symptom_key = ${symptomKey}::text
         AND deleted_at IS NULL
         AND (platform_user_id = ${duplicateId}::uuid OR user_id = ${duplicateId}::text)
     )
     UPDATE symptom_entries e
     SET tracking_id = (SELECT id FROM tgt)
     FROM dup
     WHERE e.tracking_id = dup.id
       AND EXISTS (SELECT 1 FROM tgt)
       AND dup.id IS DISTINCT FROM (SELECT id FROM tgt)`,
  );

  await runMergeSql(
    client,
    sql`WITH tgt AS (
       SELECT id FROM symptom_trackings
       WHERE symptom_key = ${symptomKey}::text
         AND deleted_at IS NULL
         AND (platform_user_id = ${targetId}::uuid OR user_id = ${targetId}::text)
       ORDER BY created_at ASC, id ASC
       LIMIT 1
     ),
     dup AS (
       SELECT id FROM symptom_trackings
       WHERE symptom_key = ${symptomKey}::text
         AND deleted_at IS NULL
         AND (platform_user_id = ${duplicateId}::uuid OR user_id = ${duplicateId}::text)
     )
     UPDATE symptom_trackings st
     SET is_active = false, deleted_at = now(), updated_at = now()
     FROM dup
     WHERE st.id = dup.id
       AND EXISTS (SELECT 1 FROM tgt)
       AND dup.id IS DISTINCT FROM (SELECT id FROM tgt)`,
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
    throw new MergeConflictError('merge: target and duplicate are the same id', [targetId]);
  }

  if (reason === 'manual') {
    if (!options?.resolution) {
      throw new MergeConflictError('merge: reason "manual" requires options.resolution', [
        targetId,
        duplicateId,
      ]);
    }
    assertManualMergeResolutionIds(options.resolution);
    if (
      options.resolution.targetId !== targetId ||
      options.resolution.duplicateId !== duplicateId
    ) {
      throw new MergeConflictError('merge: resolution targetId/duplicateId mismatch', [
        targetId,
        duplicateId,
      ]);
    }
  } else if (options?.resolution) {
    throw new MergeConflictError('merge: resolution is only valid for reason manual', [
      targetId,
      duplicateId,
    ]);
  }

  await runMergeSql(client, sql`SET CONSTRAINTS platform_users_integrator_user_id_key DEFERRED`);

  const lockRes = await runMergeSql<PuRow>(
    client,
    sql`SELECT id, phone_normalized, patient_phone_trust_at, integrator_user_id::text AS integrator_user_id, merged_into_id,
            display_name, first_name, last_name, patronymic, email, email_verified_at, role, created_at
     FROM platform_users
     WHERE id IN (${targetId}::uuid, ${duplicateId}::uuid)
     ORDER BY id
     FOR UPDATE`,
  );
  if (lockRes.rows.length !== 2) {
    throw new MergeConflictError('merge: target or duplicate platform_users row missing', [
      targetId,
      duplicateId,
    ]);
  }
  const a = lockRes.rows.find((r) => r.id === targetId);
  const b = lockRes.rows.find((r) => r.id === duplicateId);
  if (!a || !b) throw new MergeConflictError('merge: row load mismatch', [targetId, duplicateId]);

  if (b.merged_into_id != null) {
    throw new MergeConflictError('merge: duplicate already merged', [targetId, duplicateId]);
  }
  if (a.merged_into_id != null) {
    throw new MergeConflictError('merge: target is not canonical (has merged_into_id)', [
      targetId,
      duplicateId,
    ]);
  }
  if (a.role !== 'client' || b.role !== 'client') {
    throw new MergeConflictError('merge: only role=client users can be merged', [
      targetId,
      duplicateId,
    ]);
  }

  if (reason !== 'manual') {
    await assertAutomaticMergeHasNoMedicalHistory(client, targetId, duplicateId);
  }

  const manualResolution = reason === 'manual' ? options!.resolution! : undefined;

  const pA = a.phone_normalized?.trim() || null;
  const pB = b.phone_normalized?.trim() || null;
  if (!manualResolution && pA && pB && pA !== pB) {
    throw new MergeConflictError('merge: two different non-null phone numbers', [
      targetId,
      duplicateId,
    ]);
  }
  let iA = a.integrator_user_id?.trim() || null;
  let iB = b.integrator_user_id?.trim() || null;

  /**
   * Channel-link / phone_bind: поглощаем «stub» без телефона, у которого уже есть integrator_user_id
   * из мессенджера (другой id, чем у аккаунта с телефоном). Иначе merge блокируется, хотя COALESCE в UPDATE
   * оставил бы id канонического аккаунта.
   */
  if (reason === 'phone_bind' && !manualResolution && pA && !pB && iA && iB && iA !== iB) {
    await runMergeSql(
      client,
      sql`UPDATE platform_users SET integrator_user_id = NULL, updated_at = now() WHERE id = ${duplicateId}::uuid`,
    );
    iB = null;
    logger.info({
      scope: 'platform_merge',
      event: 'phone_bind_drop_duplicate_integrator_user_id',
      targetId,
      duplicateId,
    });
  }

  if (iA && iB && iA !== iB) {
    const relaxed =
      reason === 'manual' &&
      Boolean(options?.resolution) &&
      options?.allowDistinctIntegratorUserIds === true;
    if (!relaxed) {
      throw new MergeConflictError('merge: two different non-null integrator_user_id', [
        targetId,
        duplicateId,
      ]);
    }
    const verified = options?.verifiedDistinctIntegratorUserIds;
    if (
      !verified ||
      verified.targetIntegratorUserId !== iA ||
      verified.duplicateIntegratorUserId !== iB
    ) {
      throw new MergeConflictError('merge: integrator ids changed since gate', [
        targetId,
        duplicateId,
      ]);
    }
  }

  await assertSharedPhoneGuard(client, targetId, duplicateId, pA, pB);
  await assertAutoMergePasswordCredentialsSafe(client, targetId, duplicateId, reason);
  await assertPatientBookingsSafeToMerge(client, targetId, duplicateId);
  await assertPatientLfkAssignmentsSafe(client, targetId, duplicateId);
  await reconcileActiveTreatmentProgramInstancesForMerge(client, targetId, duplicateId);
  await assertOpenTestAttemptsSafe(client, targetId, duplicateId);

  if (manualResolution) {
    await mergeChannelBindingsManual(client, targetId, duplicateId, manualResolution);
  } else {
    await mergeChannelBindingsAuto(client, targetId, duplicateId);
  }

  await runMergeSql(
    client,
    sql`INSERT INTO user_notification_topics (user_id, topic_code, is_enabled, updated_at)
     SELECT ${targetId}::uuid, topic_code, is_enabled, updated_at
     FROM user_notification_topics WHERE user_id = ${duplicateId}::uuid
     ON CONFLICT (user_id, topic_code) DO UPDATE SET
       is_enabled = CASE
         WHEN EXCLUDED.updated_at >= user_notification_topics.updated_at THEN EXCLUDED.is_enabled
         ELSE user_notification_topics.is_enabled
       END,
       updated_at = GREATEST(user_notification_topics.updated_at, EXCLUDED.updated_at)`,
  );
  await runMergeSql(
    client,
    sql`DELETE FROM user_notification_topics WHERE user_id = ${duplicateId}::uuid`,
  );

  await runMergeSql(
    client,
    sql`INSERT INTO user_notification_topic_channels (user_id, topic_code, channel_code, is_enabled, updated_at)
     SELECT ${targetId}::uuid, topic_code, channel_code, is_enabled, updated_at
     FROM user_notification_topic_channels WHERE user_id = ${duplicateId}::uuid
     ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE SET
       is_enabled = CASE
         WHEN EXCLUDED.updated_at >= user_notification_topic_channels.updated_at THEN EXCLUDED.is_enabled
         ELSE user_notification_topic_channels.is_enabled
       END,
       updated_at = GREATEST(user_notification_topic_channels.updated_at, EXCLUDED.updated_at)`,
  );
  await runMergeSql(
    client,
    sql`DELETE FROM user_notification_topic_channels WHERE user_id = ${duplicateId}::uuid`,
  );

  await runMergeSql(
    client,
    sql`UPDATE reminder_rules SET platform_user_id = ${targetId}::uuid WHERE platform_user_id = ${duplicateId}::uuid`,
  );
  await runMergeSql(
    client,
    sql`UPDATE content_access_grants_webapp SET platform_user_id = ${targetId}::uuid WHERE platform_user_id = ${duplicateId}::uuid`,
  );
  await transferMedicalHistoryForMerge(client, targetId, duplicateId);
  await runMergeSql(
    client,
    sql`UPDATE user_phone_history SET platform_user_id = ${targetId}::uuid WHERE platform_user_id = ${duplicateId}::uuid`,
  );
  await runMergeSql(
    client,
    sql`UPDATE online_intake_requests SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
  );

  await runMergeSql(
    client,
    sql`UPDATE patient_lfk_assignments SET patient_user_id = ${targetId}::uuid WHERE patient_user_id = ${duplicateId}::uuid`,
  );

  if (manualResolution) {
    await mergeOauthBindingsManual(client, targetId, duplicateId, manualResolution);
  } else {
    await mergeOauthBindingsAuto(client, targetId, duplicateId);
  }

  await runMergeSql(
    client,
    sql`UPDATE channel_link_secrets SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
  );
  await runMergeSql(
    client,
    sql`UPDATE email_challenges SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
  );

  const pwTarget = await runMergeSql(
    client,
    sql`SELECT 1 FROM user_password_credentials WHERE user_id = ${targetId}::uuid LIMIT 1`,
  );
  const pwDup = await runMergeSql(
    client,
    sql`SELECT 1 FROM user_password_credentials WHERE user_id = ${duplicateId}::uuid LIMIT 1`,
  );
  if (pwTarget.rows.length === 0 && pwDup.rows.length > 0) {
    await runMergeSql(
      client,
      sql`UPDATE user_password_credentials SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
    );
  } else {
    await runMergeSql(
      client,
      sql`DELETE FROM user_password_credentials WHERE user_id = ${duplicateId}::uuid`,
    );
  }

  await runMergeSql(
    client,
    sql`INSERT INTO email_send_cooldowns (user_id, email_normalized, last_sent_at)
     SELECT ${targetId}::uuid, email_normalized, last_sent_at
     FROM email_send_cooldowns WHERE user_id = ${duplicateId}::uuid
     ON CONFLICT (user_id, email_normalized) DO UPDATE SET
       last_sent_at = GREATEST(email_send_cooldowns.last_sent_at, EXCLUDED.last_sent_at)`,
  );
  await runMergeSql(client, sql`DELETE FROM email_send_cooldowns WHERE user_id = ${duplicateId}::uuid`);

  await runMergeSql(client, sql`DELETE FROM login_tokens WHERE user_id = ${duplicateId}::uuid`);

  await mergeUserChannelPreferences(
    client,
    targetId,
    duplicateId,
    manualResolution?.channelPreferences ?? 'keep_newer',
  );

  for (const sk of SINGLETON_SYMPTOM_KEYS) {
    await dedupeSingletonSymptomTrackingsForMerge(client, targetId, duplicateId, sk);
  }

  // PG cannot infer one type for the same $n used as both ::text and ::uuid — use distinct placeholders.
  await runMergeSql(
    client,
    sql`UPDATE symptom_trackings SET user_id = ${targetId}::text, platform_user_id = ${targetId}::uuid
     WHERE user_id = ${duplicateId}::text OR platform_user_id = ${duplicateId}::uuid`,
  );
  await runMergeSql(
    client,
    sql`UPDATE symptom_entries SET user_id = ${targetId}::text, platform_user_id = ${targetId}::uuid
     WHERE user_id = ${duplicateId}::text OR platform_user_id = ${duplicateId}::uuid`,
  );
  await runMergeSql(
    client,
    sql`UPDATE lfk_complexes SET user_id = ${targetId}::text, platform_user_id = ${targetId}::uuid
     WHERE user_id = ${duplicateId}::text OR platform_user_id = ${duplicateId}::uuid`,
  );
  await runMergeSql(
    client,
    sql`UPDATE lfk_sessions SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
  );

  await runMergeSql(
    client,
    sql`UPDATE message_log SET user_id = ${targetId}::text, platform_user_id = ${targetId}::uuid
     WHERE user_id = ${duplicateId}::text OR platform_user_id = ${duplicateId}::uuid`,
  );

  await runMergeSql(
    client,
    sql`UPDATE media_files SET uploaded_by = ${targetId}::uuid WHERE uploaded_by = ${duplicateId}::uuid`,
  );
  await runMergeSql(
    client,
    sql`UPDATE media_upload_sessions SET owner_user_id = ${targetId}::uuid WHERE owner_user_id = ${duplicateId}::uuid`,
  );

  await mergeExtendedUserOwnedData(client, targetId, duplicateId);

  if (manualResolution) {
    const f = manualResolution.fields;
    const chosenEmailSql = `CASE WHEN $7::text = 'target' THEN pu.email ELSE dup.email END`;
    await runMergePgText(
      client,
      `UPDATE platform_users AS pu
       SET
         phone_normalized = CASE WHEN $3::text = 'target' THEN pu.phone_normalized ELSE dup.phone_normalized END,
         patient_phone_trust_at = CASE WHEN $3::text = 'target' THEN pu.patient_phone_trust_at ELSE dup.patient_phone_trust_at END,
         integrator_user_id = COALESCE(pu.integrator_user_id, dup.integrator_user_id),
         display_name = CASE WHEN $4::text = 'target' THEN pu.display_name ELSE dup.display_name END,
         first_name = CASE WHEN $5::text = 'target' THEN pu.first_name ELSE dup.first_name END,
         last_name = CASE WHEN $6::text = 'target' THEN pu.last_name ELSE dup.last_name END,
         patronymic = COALESCE(NULLIF(trim(pu.patronymic), ''), NULLIF(trim(dup.patronymic), '')),
         email = ${chosenEmailSql},
         email_verified_at = ${preservedEmailVerifiedAtSql(chosenEmailSql)},
         updated_at = now()
       FROM platform_users dup
       WHERE pu.id = $1::uuid AND dup.id = $2::uuid`,
      [
        targetId,
        duplicateId,
        f.phone_normalized,
        f.display_name,
        f.first_name,
        f.last_name,
        f.email,
      ],
    );
  } else {
    const chosenEmailSql = `COALESCE(pu.email, dup.email)`;
    await runMergePgText(
      client,
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
         patronymic = COALESCE(NULLIF(trim(pu.patronymic), ''), NULLIF(trim(dup.patronymic), '')),
         email = ${chosenEmailSql},
         email_verified_at = ${preservedEmailVerifiedAtSql(chosenEmailSql)},
         updated_at = now()
       FROM platform_users dup
       WHERE pu.id = $1::uuid AND dup.id = $2::uuid`,
      [targetId, duplicateId],
    );
  }

  await clearDuplicateEmailBeforeTargetNormalization(client, duplicateId);
  await clearDuplicateUserContactsBeforeTargetMirror(client, duplicateId);

  await runMergeSql(
    client,
    sql`UPDATE platform_users SET email_normalized = CASE
       WHEN email IS NOT NULL AND btrim(email) <> '' THEN lower(btrim(email))
       ELSE NULL
     END WHERE id = ${targetId}::uuid`,
  );

  await syncUserIdentityFioMirror(client, targetId);
  await syncUserContactsMirror(client, targetId);

  const mergeContactsSaved = await persistMergeLosingContacts(
    client,
    targetId,
    collectMergeLosingContacts(a, b, manualResolution),
  );
  await pruneIdentityPlatformUserContactsAfterMerge(client, targetId);
  await syncUserContactsMirror(client, targetId);

  await runMergeSql(
    client,
    sql`UPDATE platform_users SET
       phone_normalized = NULL,
       integrator_user_id = NULL,
       merged_into_id = ${targetId}::uuid,
       merged_at = now(),
       updated_at = now()
     WHERE id = ${duplicateId}::uuid`,
  );

  logger.info(
    { targetId, duplicateId, reason, mergeContactsSaved },
    '[merge] merged duplicate into target',
  );
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
  await runMergeSql(
    client,
    sql`UPDATE user_channel_bindings SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
  );
}

/** Все `user_oauth_bindings` дубликата → цель (UNIQUE по provider+provider_user_id). */
async function reassignAllUserOauthBindingsFromDuplicate(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  await runMergeSql(
    client,
    sql`UPDATE user_oauth_bindings SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
  );
}

async function mergeChannelBindingsAuto(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  await reassignAllUserChannelBindingsFromDuplicate(client, targetId, duplicateId);
  await runMergeSql(client, sql`DELETE FROM user_channel_bindings WHERE user_id = ${duplicateId}::uuid`);
}

async function mergeChannelBindingsManual(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
  resolution: ManualMergeResolution,
): Promise<void> {
  for (const ch of CHANNEL_CODES) {
    const winner = resolution.bindings[ch];
    if (winner === 'both') {
      const bindingPresence = await runMergeSql<{ user_id: string }>(
        client,
        sql`SELECT user_id::text AS user_id
         FROM user_channel_bindings
         WHERE user_id = ANY(${[targetId, duplicateId]}::uuid[]) AND channel_code = ${ch}`,
      );
      const hasTargetBinding = bindingPresence.rows.some((row) =>
        uuidTextEquals(row.user_id, targetId),
      );
      const hasDuplicateBinding = bindingPresence.rows.some((row) =>
        uuidTextEquals(row.user_id, duplicateId),
      );
      if (hasTargetBinding && hasDuplicateBinding) {
        throw new MergeConflictError(
          `manual merge: channel ${ch} conflict requires target or duplicate`,
          [targetId, duplicateId],
        );
      }
      await runMergeSql(
        client,
        sql`UPDATE user_channel_bindings SET user_id = ${targetId}::uuid
         WHERE user_id = ${duplicateId}::uuid AND channel_code = ${ch}`,
      );
      await runMergeSql(
        client,
        sql`DELETE FROM user_channel_bindings WHERE user_id = ${duplicateId}::uuid AND channel_code = ${ch}`,
      );
    } else if (winner === 'target') {
      await runMergeSql(
        client,
        sql`DELETE FROM user_channel_bindings WHERE user_id = ${duplicateId}::uuid AND channel_code = ${ch}`,
      );
    } else {
      await runMergeSql(
        client,
        sql`DELETE FROM user_channel_bindings WHERE user_id = ${targetId}::uuid AND channel_code = ${ch}`,
      );
      await runMergeSql(
        client,
        sql`UPDATE user_channel_bindings SET user_id = ${targetId}::uuid
         WHERE user_id = ${duplicateId}::uuid AND channel_code = ${ch}`,
      );
    }
  }
  await runMergeSql(client, sql`DELETE FROM user_channel_bindings WHERE user_id = ${duplicateId}::uuid`);
}

async function mergeOauthBindingsAuto(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  await reassignAllUserOauthBindingsFromDuplicate(client, targetId, duplicateId);
  await runMergeSql(client, sql`DELETE FROM user_oauth_bindings WHERE user_id = ${duplicateId}::uuid`);
}

async function mergeOauthBindingsManual(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
  resolution: ManualMergeResolution,
): Promise<void> {
  const r = await runMergeSql<OauthRow>(
    client,
    sql`SELECT user_id::text AS user_id, provider, provider_user_id, email, created_at
     FROM user_oauth_bindings WHERE user_id = ANY(${[targetId, duplicateId]}::uuid[])`,
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
      await runMergeSql(
        client,
        sql`UPDATE user_oauth_bindings SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid AND provider = ${provider}`,
      );
      continue;
    }
    if (onTarget && onDup) {
      if (onTarget.provider_user_id === onDup.provider_user_id) {
        await runMergeSql(
          client,
          sql`DELETE FROM user_oauth_bindings WHERE user_id = ${duplicateId}::uuid AND provider = ${provider}`,
        );
        continue;
      }
      const w = resolution.oauth[provider];
      if (!w) {
        throw new MergeConflictError(
          `manual merge: missing oauth resolution for provider ${provider}`,
          [targetId, duplicateId],
        );
      }
      if (w === 'target') {
        await runMergeSql(
          client,
          sql`DELETE FROM user_oauth_bindings WHERE user_id = ${duplicateId}::uuid AND provider = ${provider}`,
        );
      } else {
        await runMergeSql(
          client,
          sql`DELETE FROM user_oauth_bindings WHERE user_id = ${targetId}::uuid AND provider = ${provider}`,
        );
        await runMergeSql(
          client,
          sql`UPDATE user_oauth_bindings SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid AND provider = ${provider}`,
        );
      }
    }
  }
  await runMergeSql(client, sql`DELETE FROM user_oauth_bindings WHERE user_id = ${duplicateId}::uuid`);
}

async function mergeUserChannelPreferences(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
  strategy: 'keep_target' | 'keep_newer' | 'merge',
): Promise<void> {
  if (strategy === 'keep_target') {
    await runMergeSql(
      client,
      sql`DELETE FROM user_channel_preferences
       WHERE user_id = ${duplicateId}::text OR platform_user_id = ${duplicateId}::uuid`,
    );
    return;
  }

  await runMergeSql(
    client,
    sql`UPDATE user_channel_preferences AS t
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
       platform_user_id = ${targetId}::uuid
     FROM user_channel_preferences d
     WHERE (t.user_id = ${targetId}::text OR t.platform_user_id = ${targetId}::uuid)
       AND (d.user_id = ${duplicateId}::text OR d.platform_user_id = ${duplicateId}::uuid)
       AND t.channel_code = d.channel_code`,
  );

  await runMergeSql(
    client,
    sql`DELETE FROM user_channel_preferences d
     WHERE (d.user_id = ${duplicateId}::text OR d.platform_user_id = ${duplicateId}::uuid)
       AND EXISTS (
         SELECT 1 FROM user_channel_preferences t
         WHERE (t.user_id = ${targetId}::text OR t.platform_user_id = ${targetId}::uuid)
           AND t.channel_code = d.channel_code
       )`,
  );

  await runMergeSql(
    client,
    sql`UPDATE user_channel_preferences
     SET user_id = ${targetId}::text, platform_user_id = ${targetId}::uuid
     WHERE user_id = ${duplicateId}::text OR platform_user_id = ${duplicateId}::uuid`,
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
      {
        sql: `SELECT COUNT(*)::int AS c FROM patient_bookings WHERE platform_user_id = $1::uuid`,
        params: [uid],
      },
      {
        sql: `SELECT COUNT(*)::int AS c FROM doctor_notes WHERE user_id = $1::uuid`,
        params: [uid],
      },
      {
        sql: `SELECT COUNT(*)::int AS c FROM online_intake_requests WHERE user_id = $1::uuid`,
        params: [uid],
      },
      {
        sql: `SELECT COUNT(*)::int AS c FROM symptom_trackings WHERE platform_user_id = $1::uuid OR user_id = $2::text`,
        params: [uid, uid],
      },
      {
        sql: `SELECT COUNT(*)::int AS c FROM lfk_complexes WHERE platform_user_id = $1::uuid OR user_id = $2::text`,
        params: [uid, uid],
      },
      {
        sql: `SELECT COUNT(*)::int AS c FROM patient_lfk_assignments WHERE patient_user_id = $1::uuid`,
        params: [uid],
      },
    ];
    let sum = 0;
    for (const { sql: queryText, params } of q) {
      const r = await runMergePgText<{ c: number }>(client, queryText, params);
      sum += r.rows[0]?.c ?? 0;
    }
    return sum;
  }

  const ct = await meaningfulCount(targetId);
  const cd = await meaningfulCount(duplicateId);
  if (ct > 0 && cd > 0) {
    throw new MergeDependentConflictError(
      'shared-phone guard: meaningful data on both candidates',
      [targetId, duplicateId],
    );
  }
}

async function assertPatientBookingsSafeToMerge(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  const overlap = await runMergeSql<{ c: string }>(
    client,
    sql`SELECT COUNT(*)::text AS c
     FROM patient_bookings pb1
     INNER JOIN patient_bookings pb2
       ON pb1.platform_user_id = ${targetId}::uuid
      AND pb2.platform_user_id = ${duplicateId}::uuid
      AND pb1.id <> pb2.id
      AND tstzrange(pb1.slot_start, pb1.slot_end, '[)') && tstzrange(pb2.slot_start, pb2.slot_end, '[)')
      AND pb1.status IN ('confirmed', 'rescheduled', 'creating', 'cancelling', 'cancel_failed')
      AND pb2.status IN ('confirmed', 'rescheduled', 'creating', 'cancelling', 'cancel_failed')`,
  );
  const n = parseInt(overlap.rows[0]?.c ?? '0', 10);
  if (n > 0) {
    throw new MergeDependentConflictError(
      'patient_bookings: overlapping active slots between merge candidates',
      [targetId, duplicateId],
    );
  }
}

async function assertPatientLfkAssignmentsSafe(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  const r = await runMergeSql<{ c: string }>(
    client,
    sql`SELECT COUNT(*)::text AS c
     FROM patient_lfk_assignments a
     INNER JOIN patient_lfk_assignments b
       ON a.patient_user_id = ${targetId}::uuid
      AND b.patient_user_id = ${duplicateId}::uuid
      AND a.organization_id = b.organization_id
      AND a.template_id = b.template_id
      AND a.is_active = true
      AND b.is_active = true`,
  );
  const n = parseInt(r.rows[0]?.c ?? '0', 10);
  if (n > 0) {
    throw new MergeDependentConflictError('patient_lfk_assignments: active template conflict', [
      targetId,
      duplicateId,
    ]);
  }
}

type ActiveTreatmentProgramMergePair = {
  target_instance_id: string;
  target_assignment_source: string;
  target_template_id: string | null;
  duplicate_instance_id: string;
  duplicate_assignment_source: string;
  duplicate_template_id: string | null;
};

/**
 * Two promo instances created from the same template have equivalent immutable structure. Preserve
 * the canonical instance as the patient-facing plan, union item/stage progress into it, and move the
 * append-only completion log to the matching canonical items. The superseded instance itself stays
 * in history and is completed by the caller.
 */
async function consolidateMatchingPromoProgress(
  client: PlatformMergeDbClient,
  targetInstanceId: string,
  duplicateInstanceId: string,
): Promise<void> {
  await runMergePgText(
    client,
    `WITH stage_map AS MATERIALIZED (
       SELECT ts.id AS target_stage_id, ds.id AS duplicate_stage_id
       FROM treatment_program_instance_stages ts
       INNER JOIN treatment_program_instance_stages ds
         ON ts.instance_id = $1::uuid
        AND ds.instance_id = $2::uuid
        AND ts.source_stage_id IS NOT DISTINCT FROM ds.source_stage_id
        AND ts.sort_order = ds.sort_order
     ),
     item_map AS MATERIALIZED (
       SELECT ti.id AS target_item_id, di.id AS duplicate_item_id
       FROM stage_map sm
       INNER JOIN treatment_program_instance_stage_items ti ON ti.stage_id = sm.target_stage_id
       INNER JOIN treatment_program_instance_stage_items di
         ON di.stage_id = sm.duplicate_stage_id
        AND ti.item_type = di.item_type
        AND ti.item_ref_id = di.item_ref_id
        AND ti.sort_order = di.sort_order
     ),
     merged_items AS (
       UPDATE treatment_program_instance_stage_items ti
       SET completed_at = CASE
             WHEN ti.completed_at IS NULL THEN di.completed_at
             WHEN di.completed_at IS NULL THEN ti.completed_at
             ELSE GREATEST(ti.completed_at, di.completed_at)
           END,
           last_viewed_at = CASE
             WHEN ti.last_viewed_at IS NULL THEN di.last_viewed_at
             WHEN di.last_viewed_at IS NULL THEN ti.last_viewed_at
             ELSE GREATEST(ti.last_viewed_at, di.last_viewed_at)
           END
       FROM item_map im
       INNER JOIN treatment_program_instance_stage_items di ON di.id = im.duplicate_item_id
       WHERE ti.id = im.target_item_id
       RETURNING ti.id
     ),
     moved_actions AS (
       UPDATE program_action_log pal
       SET instance_id = $1::uuid,
           instance_stage_item_id = im.target_item_id
       FROM item_map im
       WHERE pal.instance_id = $2::uuid
         AND pal.instance_stage_item_id = im.duplicate_item_id
       RETURNING pal.id
     ),
     merged_stages AS (
       UPDATE treatment_program_instance_stages ts
       SET status = CASE
             WHEN ts.status = 'completed' OR ds.status = 'completed' THEN 'completed'
             WHEN ts.status = 'in_progress' OR ds.status = 'in_progress' THEN 'in_progress'
             WHEN ts.status = 'available' OR ds.status = 'available' THEN 'available'
             ELSE ts.status
           END,
           started_at = CASE
             WHEN ts.started_at IS NULL THEN ds.started_at
             WHEN ds.started_at IS NULL THEN ts.started_at
             ELSE LEAST(ts.started_at, ds.started_at)
           END
       FROM stage_map sm
       INNER JOIN treatment_program_instance_stages ds ON ds.id = sm.duplicate_stage_id
       WHERE ts.id = sm.target_stage_id
       RETURNING ts.id
     )
     UPDATE treatment_program_instances ti
     SET patient_plan_last_opened_at = CASE
           WHEN ti.patient_plan_last_opened_at IS NULL THEN di.patient_plan_last_opened_at
           WHEN di.patient_plan_last_opened_at IS NULL THEN ti.patient_plan_last_opened_at
           ELSE GREATEST(ti.patient_plan_last_opened_at, di.patient_plan_last_opened_at)
         END,
         updated_at = GREATEST(ti.updated_at, di.updated_at)
     FROM treatment_program_instances di
     WHERE ti.id = $1::uuid
       AND di.id = $2::uuid`,
    [targetInstanceId, duplicateInstanceId],
  );
}

async function assertAutoMergePasswordCredentialsSafe(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
  reason: MergePlatformUsersReason,
): Promise<void> {
  if (reason === 'manual') return;
  const credentials = await runMergeSql<{ user_id: string }>(
    client,
    sql`SELECT user_id::text
     FROM user_password_credentials
     WHERE user_id IN (${targetId}::uuid, ${duplicateId}::uuid)
     ORDER BY user_id
     FOR UPDATE`,
  );
  if (credentials.rows.length > 1) {
    throw new MergeConflictError('merge: both users have password credentials', [
      targetId,
      duplicateId,
    ]);
  }
}

/**
 * A promo instance is the platform default, not a clinician/course assignment. When duplicate
 * identities each materialized an active plan, promo must not prevent identity reconciliation:
 * close the promo side first, then let the normal patient_user_id repoint preserve both histories.
 * Two real active assignments remain a hard blocker.
 */
async function reconcileActiveTreatmentProgramInstancesForMerge(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  const r = await runMergeSql<ActiveTreatmentProgramMergePair>(
    client,
    sql`SELECT t.id::text AS target_instance_id,
            t.assignment_source AS target_assignment_source,
            t.template_id::text AS target_template_id,
            d.id::text AS duplicate_instance_id,
            d.assignment_source AS duplicate_assignment_source,
            d.template_id::text AS duplicate_template_id
     FROM treatment_program_instances t
     INNER JOIN treatment_program_instances d
       ON t.patient_user_id = ${targetId}::uuid
      AND d.patient_user_id = ${duplicateId}::uuid
      AND t.status = 'active'
      AND d.status = 'active'`,
  );
  const pair = r.rows[0];
  if (!pair) return;

  const targetIsPromo = pair.target_assignment_source === 'promo';
  const duplicateIsPromo = pair.duplicate_assignment_source === 'promo';
  if (!targetIsPromo && !duplicateIsPromo) {
    throw new MergeDependentConflictError(
      'treatment_program_instances: active program on both merge candidates',
      [targetId, duplicateId],
    );
  }

  if (
    targetIsPromo &&
    duplicateIsPromo &&
    typeof pair.target_template_id === 'string' &&
    pair.target_template_id === pair.duplicate_template_id
  ) {
    await consolidateMatchingPromoProgress(
      client,
      pair.target_instance_id,
      pair.duplicate_instance_id,
    );
  }

  const closingInstanceId =
    targetIsPromo && !duplicateIsPromo ? pair.target_instance_id : pair.duplicate_instance_id;

  await runMergePgText(
    client,
    `WITH closed AS (
       UPDATE treatment_program_instances
       SET status = 'completed', updated_at = now()
       WHERE id = $1::uuid
         AND status = 'active'
         AND assignment_source = 'promo'
       RETURNING id, organization_id
     )
     INSERT INTO treatment_program_events (
       organization_id, instance_id, actor_id, event_type, target_type, target_id, payload, reason
     )
     SELECT organization_id,
            id,
            NULL,
            'status_changed',
            'program',
            id,
            jsonb_build_object(
              'scope', 'program',
              'from', 'active',
              'to', 'completed',
              'supersededBy', 'platform_user_merge'
            ),
            'platform_user_merge'
     FROM closed`,
    [closingInstanceId],
  );
}

async function assertOpenTestAttemptsSafe(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  const r = await runMergeSql<{ c: string }>(
    client,
    sql`SELECT COUNT(*)::text AS c
     FROM test_attempts t
     INNER JOIN test_attempts d
       ON t.patient_user_id = ${targetId}::uuid
      AND d.patient_user_id = ${duplicateId}::uuid
      AND t.submitted_at IS NULL
      AND d.submitted_at IS NULL
      AND t.instance_stage_item_id = d.instance_stage_item_id`,
  );
  const n = parseInt(r.rows[0]?.c ?? '0', 10);
  if (n > 0) {
    throw new MergeDependentConflictError(
      'test_attempts: open attempt conflict on same stage item',
      [targetId, duplicateId],
    );
  }
}

/**
 * Clears duplicate email before target `email_normalized` recompute so two canonical rows
 * cannot temporarily share the same confirmed email in `user_contacts`.
 */
async function clearDuplicateEmailBeforeTargetNormalization(
  client: PlatformMergeDbClient,
  duplicateId: string,
): Promise<void> {
  await runMergeSql(
    client,
    sql`UPDATE platform_users SET email = NULL, email_normalized = NULL, updated_at = now() WHERE id = ${duplicateId}::uuid`,
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
  await runMergePgText(
    client,
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
  await runMergeSql(client, sql`DELETE FROM material_ratings WHERE user_id = ${duplicateId}::uuid`);

  await runMergePgText(
    client,
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
  await runMergeSql(
    client,
    sql`DELETE FROM patient_daily_warmup_presentations WHERE user_id = ${duplicateId}::uuid`,
  );

  await runMergePgText(
    client,
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
  await runMergeSql(
    client,
    sql`DELETE FROM be_patient_booking_profiles WHERE platform_user_id = ${duplicateId}::uuid`,
  );

  // Migration 0200 dropped the single global `product_analytics_user_hourly_pkey` and replaced it
  // with two partial unique indexes split on `organization_id` nullability (global vs per-org
  // bucket). `ON CONFLICT ON CONSTRAINT` cannot target a partial index, and no single conflict
  // target can match both partial predicates in one statement, so this merge runs once per branch.
  // `organization_id` must be carried through explicitly -- omitting it (as the pre-0200 version of
  // this INSERT did) silently drops every merged row's clinic association.
  await runMergePgText(
    client,
    `INSERT INTO product_analytics_user_hourly (
       organization_id, bucket_hour, user_id, entry_channel, page_key,
       app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
     )
     SELECT organization_id, bucket_hour, $1::uuid, entry_channel, page_key,
            app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
     FROM product_analytics_user_hourly WHERE user_id = $2::uuid AND organization_id IS NULL
     ON CONFLICT (bucket_hour, user_id, entry_channel, page_key) WHERE organization_id IS NULL
     DO UPDATE SET
       app_opens = product_analytics_user_hourly.app_opens + EXCLUDED.app_opens,
       page_views = product_analytics_user_hourly.page_views + EXCLUDED.page_views,
       push_opens = product_analytics_user_hourly.push_opens + EXCLUDED.push_opens,
       active_minutes = product_analytics_user_hourly.active_minutes + EXCLUDED.active_minutes,
       last_seen_at = GREATEST(product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
       updated_at = GREATEST(product_analytics_user_hourly.updated_at, EXCLUDED.updated_at)`,
    [targetId, duplicateId],
  );
  await runMergePgText(
    client,
    `INSERT INTO product_analytics_user_hourly (
       organization_id, bucket_hour, user_id, entry_channel, page_key,
       app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
     )
     SELECT organization_id, bucket_hour, $1::uuid, entry_channel, page_key,
            app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
     FROM product_analytics_user_hourly WHERE user_id = $2::uuid AND organization_id IS NOT NULL
     ON CONFLICT (organization_id, bucket_hour, user_id, entry_channel, page_key)
       WHERE organization_id IS NOT NULL
     DO UPDATE SET
       app_opens = product_analytics_user_hourly.app_opens + EXCLUDED.app_opens,
       page_views = product_analytics_user_hourly.page_views + EXCLUDED.page_views,
       push_opens = product_analytics_user_hourly.push_opens + EXCLUDED.push_opens,
       active_minutes = product_analytics_user_hourly.active_minutes + EXCLUDED.active_minutes,
       last_seen_at = GREATEST(product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
       updated_at = GREATEST(product_analytics_user_hourly.updated_at, EXCLUDED.updated_at)`,
    [targetId, duplicateId],
  );
  await runMergeSql(
    client,
    sql`DELETE FROM product_analytics_user_hourly WHERE user_id = ${duplicateId}::uuid`,
  );

  await runMergeSql(
    client,
    sql`DELETE FROM patient_diary_day_snapshots d
     WHERE d.platform_user_id = ${duplicateId}::uuid
       AND EXISTS (
         SELECT 1 FROM patient_diary_day_snapshots t
         WHERE t.platform_user_id = ${targetId}::uuid AND t.local_date = d.local_date
       )`,
  );
  await runMergeSql(
    client,
    sql`UPDATE patient_diary_day_snapshots SET platform_user_id = ${targetId}::uuid WHERE platform_user_id = ${duplicateId}::uuid`,
  );

  await runMergeSql(
    client,
    sql`DELETE FROM user_web_push_subscriptions d
     WHERE d.user_id = ${duplicateId}::uuid
       AND EXISTS (
         SELECT 1 FROM user_web_push_subscriptions t
         WHERE t.user_id = ${targetId}::uuid AND t.endpoint = d.endpoint
       )`,
  );
  await runMergeSql(
    client,
    sql`UPDATE user_web_push_subscriptions SET user_id = ${targetId}::uuid WHERE user_id = ${duplicateId}::uuid`,
  );

  await runMergeSql(
    client,
    sql`DELETE FROM broadcast_audit_recipients
     WHERE platform_user_id = ${duplicateId}::uuid
       AND audit_id IN (
         SELECT audit_id FROM broadcast_audit_recipients WHERE platform_user_id = ${targetId}::uuid
       )`,
  );
  await runMergeSql(
    client,
    sql`UPDATE broadcast_audit_recipients SET platform_user_id = ${targetId}::uuid WHERE platform_user_id = ${duplicateId}::uuid`,
  );

  const simpleRepoints: Array<[string, [string, string]]> = [
    [
      `UPDATE patient_content_rating_feedback SET user_id = $1::uuid WHERE user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE patient_practice_completions SET user_id = $1::uuid WHERE user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE patient_daily_warmup_video_views SET user_id = $1::uuid WHERE user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE program_action_log SET patient_user_id = $1::uuid WHERE patient_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE test_attempts SET patient_user_id = $1::uuid WHERE patient_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE be_patient_timeline_events SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE be_appointment_staff_comments SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE be_payment_intents SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE be_payments SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE be_payment_history_events SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE be_patient_packages SET platform_user_id = $1::uuid WHERE platform_user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE product_push_notifications SET user_id = $1::uuid WHERE user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
    [
      `UPDATE product_analytics_events_recent SET user_id = $1::uuid WHERE user_id = $2::uuid`,
      [targetId, duplicateId],
    ],
  ];
  for (const [queryText, params] of simpleRepoints) {
    await runMergePgText(client, queryText, params);
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
  const r = await runMergeSql<{ uid: string; c: string }>(
    client,
    sql`SELECT platform_user_id::text AS uid, COUNT(*)::text AS c
     FROM patient_bookings
     WHERE platform_user_id = ANY(${[a.id, b.id]}::uuid[])
     GROUP BY platform_user_id`,
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
