/**
 * Полное удаление клиента из канонического webapp-хранилища.
 * Вызывать только после явного подтверждения (например из API кабинета врача для заархивированных).
 *
 * Строгий сценарий (S3, advisory lock, audit): `runStrictPurgePlatformUser` в `strictPlatformUserPurge.ts`.
 */
import type { Pool, PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { runPurgeClientPgText, runPurgePoolPgText } from '@/infra/platformUserPurgeSql';
import {
  CONTACTS,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
} from '@/infra/repos/userContactsSql';

/** Compatibility result for the retired post-commit integrator cleanup path. */
export function getIntegratorPoolForPurge(): Pool | null {
  return null;
}

/** Только цифры; для сопоставления записей по номеру. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Таблицы с данными клиента по `user_id` / `platform_user_id` (UUID или TEXT, совпадающий с UUID).
 * Не включает дневник симптомов/ЛФК — см. `deleteSymptomAndLfkDiaryForUser` (порядок FK: комплексы ↔ trackings).
 */
const CONTENT_TABLES: { table: string; column: string }[] = [
  { table: 'patient_bookings', column: 'platform_user_id' },
  { table: 'be_appointments', column: 'platform_user_id' },
  { table: 'reminder_rules', column: 'platform_user_id' },
  { table: 'doctor_notes', column: 'user_id' },
  { table: 'support_conversations', column: 'platform_user_id' },
  { table: 'patient_lfk_assignments', column: 'patient_user_id' },
  { table: 'content_access_grants_webapp', column: 'platform_user_id' },
  { table: 'user_notification_topic_channels', column: 'user_id' },
  { table: 'user_web_push_subscriptions', column: 'user_id' },
  { table: 'online_intake_requests', column: 'user_id' },
];

/** Дневники симптомов и ЛФК: порядок как в `pgDiaryPurge` (FK `lfk_complexes.symptom_tracking_id` → `symptom_trackings`). */
async function deleteSymptomAndLfkDiaryForUser(client: PoolClient, userId: string): Promise<void> {
  await runPurgeClientPgText(
    client,
    `UPDATE lfk_complexes SET symptom_tracking_id = NULL, updated_at = now() WHERE user_id = $1`,
    [userId],
  );
  await runPurgeClientPgText(client, `DELETE FROM lfk_complexes WHERE user_id = $1`, [userId]);
  await runPurgeClientPgText(client, `DELETE FROM symptom_trackings WHERE user_id = $1`, [userId]);
}

const IDENTITY_TABLES: { table: string; column: string }[] = [
  { table: 'user_contacts', column: 'platform_user_id' },
  { table: 'user_channel_bindings', column: 'user_id' },
  { table: 'login_tokens', column: 'user_id' },
  { table: 'user_oauth_bindings', column: 'user_id' },
];

export function isPlatformUserUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function deletePhoneKeyedWebappRows(
  client: PoolClient,
  phoneNormalized: string,
): Promise<void> {
  const digs = phoneDigits(phoneNormalized);

  await runPurgeClientPgText(
    client,
    `DELETE FROM phone_otp_locks WHERE regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
    [digs],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM phone_challenges WHERE regexp_replace(phone, '\\D', '', 'g') = $1`,
    [digs],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM message_log
     WHERE user_id IN (
       SELECT id::text FROM platform_users
       WHERE phone_normalized IS NOT NULL
         AND regexp_replace(phone_normalized, '\\D', '', 'g') = $1
     )
        OR platform_user_id IN (
          SELECT id FROM platform_users
          WHERE phone_normalized IS NOT NULL
            AND regexp_replace(phone_normalized, '\\D', '', 'g') = $1
        )`,
    [digs],
  );
}

async function deleteWebappProjectionByIntegratorUserId(
  client: PoolClient,
  integratorUserId: string,
): Promise<void> {
  if (!/^\d+$/.test(integratorUserId.trim())) return;
  const id = integratorUserId.trim();

  await runPurgeClientPgText(
    client,
    `DELETE FROM reminder_delivery_events WHERE integrator_user_id = $1::bigint`,
    [id],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM reminder_occurrence_history WHERE integrator_user_id = $1::bigint`,
    [id],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM reminder_rules WHERE integrator_user_id = $1::bigint`,
    [id],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM content_access_grants_webapp WHERE integrator_user_id = $1::bigint`,
    [id],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM support_question_messages WHERE question_id IN (
       SELECT id FROM support_questions WHERE conversation_id IN (
         SELECT id FROM support_conversations WHERE integrator_user_id = $1::bigint
       )
     )`,
    [id],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM support_questions WHERE conversation_id IN (
       SELECT id FROM support_conversations WHERE integrator_user_id = $1::bigint
     )`,
    [id],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM support_conversations WHERE integrator_user_id = $1::bigint`,
    [id],
  );
}

async function clearPlatformUserDeleteBlockers(client: PoolClient, userId: string): Promise<void> {
  await runPurgeClientPgText(
    client,
    `UPDATE platform_users SET blocked_by = NULL WHERE blocked_by = $1`,
    [userId],
  );
  await runPurgeClientPgText(
    client,
    `UPDATE patient_lfk_assignments SET assigned_by = NULL WHERE assigned_by = $1`,
    [userId],
  );
  await runPurgeClientPgText(
    client,
    `DELETE FROM patient_lfk_assignments WHERE patient_user_id = $1`,
    [userId],
  );
  await runPurgeClientPgText(client, `DELETE FROM online_intake_requests WHERE user_id = $1`, [
    userId,
  ]);
  await runPurgeClientPgText(
    client,
    `UPDATE lfk_complex_templates SET created_by = NULL WHERE created_by = $1`,
    [userId],
  );
  await runPurgeClientPgText(
    client,
    `UPDATE lfk_exercises SET created_by = NULL WHERE created_by = $1`,
    [userId],
  );
  await runPurgeClientPgText(
    client,
    `UPDATE system_settings SET updated_by = NULL WHERE updated_by = $1`,
    [userId],
  );
  await runPurgeClientPgText(
    client,
    `UPDATE doctor_notes SET author_id = user_id WHERE author_id = $1 AND user_id <> $1`,
    [userId],
  );
}

async function deleteContentTablesForUser(client: PoolClient, userId: string): Promise<void> {
  for (const { table, column } of CONTENT_TABLES) {
    if (table === 'doctor_notes') {
      await runPurgeClientPgText(
        client,
        `DELETE FROM doctor_notes WHERE user_id = $1 OR author_id = $1`,
        [userId],
      );
    } else {
      await runPurgeClientPgText(client, `DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
    }
  }
}

export type PurgeArtifactKeys = {
  intakeS3Keys: string[];
  /** media_files rows that need post-commit cleanup; `s3Key = null` means DB-only row delete. */
  mediaFiles: { id: string; s3Key: string | null }[];
  /**
   * `patient_files` rows for this user (as patient). The row cascade-deletes with `platform_users`,
   * so its object must be captured here before the webapp DELETE — same treatment as `intakeS3Keys`.
   */
  patientFileS3Keys: string[];
};

/**
 * Collect external-cleanup artifacts still referenced in DB for this user. Must run inside the purge transaction
 * **after** `pg_advisory_xact_lock` and **before** any DELETE that cascades to `online_intake_attachments`
 * / clears media ownership.
 */
export async function collectPurgeArtifactKeys(
  client: PoolClient,
  userId: string,
): Promise<PurgeArtifactKeys> {
  const intakeRes = await runPurgeClientPgText<{ s3_key: string }>(
    client,
    `SELECT a.s3_key
       FROM online_intake_attachments a
       INNER JOIN online_intake_requests r ON r.id = a.request_id
      WHERE r.user_id = $1::uuid
        AND a.s3_key IS NOT NULL`,
    [userId],
  );
  const intakeS3Keys = intakeRes.rows
    .map((r) => r.s3_key)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  const mediaRes = await runPurgeClientPgText<{ id: string; s3_key: string | null }>(
    client,
    `SELECT id::text AS id, s3_key
       FROM media_files
      WHERE uploaded_by = $1::uuid`,
    [userId],
  );
  const mediaFiles = mediaRes.rows.map((r) => ({ id: r.id, s3Key: r.s3_key ?? null }));

  const patientFilesRes = await runPurgeClientPgText<{
    s3_key: string;
    media_file_id: string | null;
  }>(
    client,
    `SELECT s3_key, media_file_id::text AS media_file_id
       FROM patient_files
      WHERE patient_user_id = $1::uuid`,
    [userId],
  );
  const patientFileS3Keys = patientFilesRes.rows
    .map((r) => r.s3_key)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  // A patient-file upload co-created via a media-library folder gets its own `media_files` row,
  // owned by the *uploader* (doctor), not the patient -- so the `uploaded_by` query above misses it.
  // Same object key as `patientFileS3Keys`; folding it into `mediaFiles` reuses the existing per-key
  // S3-then-row cleanup instead of a second mechanism.
  const existingMediaIds = new Set(mediaFiles.map((m) => m.id));
  for (const row of patientFilesRes.rows) {
    if (row.media_file_id && !existingMediaIds.has(row.media_file_id)) {
      mediaFiles.push({ id: row.media_file_id, s3Key: row.s3_key });
      existingMediaIds.add(row.media_file_id);
    }
  }

  return { intakeS3Keys, mediaFiles, patientFileS3Keys };
}

export type PurgePlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  role: string;
};

/**
 * Core webapp DELETE sequence (single transaction). Caller must hold advisory lock and have called `collectPurgeArtifactKeys` first when strict S3 cleanup is required.
 */
export async function runWebappPurgeCoreInTransaction(
  client: PoolClient,
  user: PurgePlatformUserRow,
): Promise<void> {
  if (user.phone_normalized?.trim()) {
    await deletePhoneKeyedWebappRows(client, user.phone_normalized);
  }

  await clearPlatformUserDeleteBlockers(client, user.id);
  await deleteSymptomAndLfkDiaryForUser(client, user.id);
  await deleteContentTablesForUser(client, user.id);

  if (user.integrator_user_id && /^\d+$/.test(user.integrator_user_id)) {
    await deleteWebappProjectionByIntegratorUserId(client, user.integrator_user_id);
  }

  await runPurgeClientPgText(
    client,
    `DELETE FROM message_log
       WHERE user_id = $1::text OR platform_user_id = $1::uuid`,
    [user.id],
  );

  for (const { table, column } of IDENTITY_TABLES) {
    await runPurgeClientPgText(client, `DELETE FROM ${table} WHERE ${column} = $1`, [user.id]);
  }

  await runPurgeClientPgText(client, `DELETE FROM platform_users WHERE id = $1`, [user.id]);
}

/** Messenger rows in webapp `user_channel_bindings` that map to integrator `identities.resource`. */
const INTEGRATOR_CLEANUP_CHANNEL_CODES = new Set(['telegram', 'max']);

export type MessengerBindingForIntegratorCleanup = {
  channel_code: string;
  external_id: string;
};

/** Load bindings before webapp deletes `user_channel_bindings` (same purge transaction). */
export async function fetchMessengerBindingsForIntegratorCleanup(
  client: PoolClient,
  userId: string,
): Promise<MessengerBindingForIntegratorCleanup[]> {
  const r = await runPurgeClientPgText<{ channel_code: string; external_id: string }>(
    client,
    `SELECT channel_code, external_id FROM user_channel_bindings
     WHERE user_id = $1::uuid AND channel_code IN ('telegram', 'max')`,
    [userId],
  );
  return r.rows;
}

export async function resolveIntegratorUserIds(
  _integratorDb: Pool | null,
  _digs: string,
  _webappIntegratorUserId: string | null,
  _messengerBindings?: ReadonlyArray<MessengerBindingForIntegratorCleanup>,
): Promise<string[]> {
  return [];
}

export async function deleteIntegratorPhoneData(
  _integratorDb: Pool,
  _digs: string,
  _integratorUserIds: string[],
  _messengerBindings?: ReadonlyArray<MessengerBindingForIntegratorCleanup>,
): Promise<void> {
  // Integrator identity/contact storage was retired. Canonical user data is deleted in the webapp
  // transaction together with user_channel_bindings.
}

export type IntegratorPurgeCleanupResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; message: string };

/**
 * Same as `deleteIntegratorPhoneData` but never throws; used for post-commit strict purge (parallel with S3).
 */
export async function deleteIntegratorPhoneDataWithResult(
  integratorDb: Pool | null,
  digs: string,
  integratorUserIds: string[],
  messengerBindings?: ReadonlyArray<MessengerBindingForIntegratorCleanup>,
): Promise<IntegratorPurgeCleanupResult> {
  if (!integratorDb) {
    return { ok: true, skipped: true };
  }
  try {
    await deleteIntegratorPhoneData(integratorDb, digs, integratorUserIds, messengerBindings);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message };
  }
}

/** Mirrors `runStrictPurgePlatformUser` — see `strictPlatformUserPurge.ts`. */
export type StrictPurgeOutcome = 'completed' | 'partial_failed' | 'needs_retry';

export type PurgePlatformUserResult =
  | { ok: true; integratorSkipped: boolean; outcome?: StrictPurgeOutcome }
  | { ok: false; error: 'invalid_uuid' | 'not_found' | 'not_client' | 'transaction_failed' };

/**
 * Удаляет строку `platform_users` и связанные данные (см. CONTENT_TABLES / скрипт purge-by-id).
 * Делегирует в `runStrictPurgePlatformUser` (advisory lock, S3, integrator, audit при необходимости).
 */
export async function purgePlatformUserByPlatformId(
  rawId: string,
): Promise<PurgePlatformUserResult> {
  const { runStrictPurgePlatformUser } = await import('@/infra/strictPlatformUserPurge');
  const r = await runStrictPurgePlatformUser({
    targetId: rawId,
    actorId: null,
    audit: { enabled: true },
  });
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  return {
    ok: true,
    integratorSkipped: r.integratorSkipped,
    outcome: r.outcome,
  };
}

async function loadPurgeUserRow(db: Pool, id: string): Promise<PurgePlatformUserRow | null> {
  const userRes = await runPurgePoolPgText<PurgePlatformUserRow>(
    db,
    `SELECT pu.id, ${CONTACTS.phoneNormalized} AS phone_normalized, pu.integrator_user_id::text AS integrator_user_id, pu.role
     FROM platform_users pu
     ${USER_CONTACTS_PRIMARY_PHONE_LATERAL}
     WHERE pu.id = $1`,
    [id],
  );
  return userRes.rows[0] ?? null;
}

/** For tests / diagnostics: load user row without deleting. */
export async function getPurgePlatformUserRowForTests(
  rawId: string,
): Promise<PurgePlatformUserRow | null> {
  const id = rawId.trim();
  if (!isPlatformUserUuid(id)) return null;
  return loadPurgeUserRow(getPool(), id);
}
