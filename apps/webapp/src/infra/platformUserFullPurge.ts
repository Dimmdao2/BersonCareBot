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

/** Только цифры; для сопоставления записей по номеру. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Таблицы с данными клиента по `user_id` / `platform_user_id` (UUID или TEXT, совпадающий с UUID).
 * Не включает дневник симптомов/ЛФК — см. `deleteSymptomAndLfkDiaryForUser` (порядок FK: комплексы ↔ trackings).
 *
 * Exported so the retired-integrator-id projection census can prove, mechanically, that every one of
 * its tables is purged by the canonical platform-user key.
 */
export const CONTENT_TABLES: { table: string; column: string }[] = [
  { table: 'patient_bookings', column: 'platform_user_id' },
  { table: 'be_appointments', column: 'platform_user_id' },
  { table: 'reminder_rules', column: 'platform_user_id' },
  // Track D consolidated the three occurrence stores into this one table; it has no FK to
  // `platform_users`, so nothing cascades it away. Audit C1: keying its purge on the retired
  // `integrator_user_id` left the whole reminder history of every retired-id-less user behind.
  { table: 'reminder_occurrence_history', column: 'platform_user_id' },
  { table: 'doctor_notes', column: 'user_id' },
  { table: 'support_conversations', column: 'platform_user_id' },
  { table: 'patient_lfk_assignments', column: 'patient_user_id' },
  { table: 'content_access_grants_webapp', column: 'platform_user_id' },
  { table: 'user_notification_topic_channels', column: 'user_id' },
  { table: 'user_web_push_subscriptions', column: 'user_id' },
  { table: 'online_intake_requests', column: 'user_id' },
  // Final systemic lifecycle audit 2026-08-28, F1: `manual_patient_commands` references
  // `org_enrollments` (organization_id, platform_user_id) with the default ON DELETE NO ACTION.
  // `org_enrollments` itself cascades away with `platform_users`, so an undeleted row here made the
  // database refuse the final `DELETE FROM platform_users` with `23503` for every client who ever
  // received a manual command — nothing was purged at all, not just this table.
  { table: 'manual_patient_commands', column: 'platform_user_id' },
  // F2: no FK to `platform_users` at all; same class as `reminder_occurrence_history` above — patient
  // diary content that must die with the account, but nothing cascades it away.
  { table: 'patient_diary_day_snapshots', column: 'platform_user_id' },
  { table: 'patient_practice_completions', column: 'user_id' },
  // Exhaustive lifecycle census audit 2026-08-28, F2: `auth.channel_link_start` keys its rate-limit
  // bucket on the RAW platform uuid, so `auth_rate_limit_events.key` IS the person for that scope.
  // The limiter only trims the `(scope, key)` of the call in front of it, and after an account is
  // deleted there is no next call for its key — the bucket outlived the account (15 rows carrying
  // 11 client uuids on bcb_webapp_dev, the same on bersoncarebot_test). Purged by the same one
  // statement shape as every other row here; a platform uuid cannot collide with the IP / phone /
  // e-mail keys of the other scopes.
  { table: 'auth_rate_limit_events', column: 'key' },
  // Same audit, F5: the registry declares `explicit-delete` for this table, and that statement was
  // true of the BEHAVIOUR but not of this list — the rows were removed by a hand-written statement
  // below instead. Naming it here makes the declaration checkable; the residual statement now only
  // covers the legacy TEXT column, so the set of deleted rows is unchanged.
  { table: 'message_log', column: 'platform_user_id' },
];

/**
 * Identity roots of ANOTHER persona that share `platform_users.id` without any FK. A client account
 * that also owns one of these is refused, whole, before any destructive statement — see
 * `runWebappPurgeCoreInTransaction`.
 *
 * Exhaustive lifecycle census audit 2026-08-28, F2: `be_specialists.id` IS a `platform_users.id`,
 * and bcb_webapp_dev carries one ACTIVE specialist whose id belongs to a `role='client'` platform
 * user, with 8 working-hours rows, 1 service-availability row and 12 appointments hanging off it.
 * Strict purge accepted that row: it deleted the platform identity and left the same raw uuid
 * running a live clinic schedule. Deleting the specialist instead would destroy clinic data that is
 * not the client's, so the only correct answer is to refuse.
 */
export const IDENTITY_ROOT_TABLES: { table: string; column: string; reason: string }[] = [
  {
    table: 'be_specialists',
    column: 'id',
    reason: 'active specialist card shares this platform user id',
  },
];

/** Thrown by the purge core when an identity root of another persona shares the account id. */
export class PurgeIdentityRootConflictError extends Error {
  readonly conflicts: readonly string[];

  constructor(conflicts: readonly string[]) {
    super(`account purge refused: ${conflicts.join('; ')}`);
    this.name = 'PurgeIdentityRootConflictError';
    this.conflicts = conflicts;
  }
}

/** One relation whose reference to the purged person is nulled instead of deleted. */
export type AnonymiseOnPurgeTarget = {
  table: string;
  /** The canonical reference column, the one the lifecycle registry declares. Nulled. */
  column: string;
  /**
   * Further columns of the SAME row that carry the same person under another name (a retired
   * integrator id kept as `text`). Nulled together with `column`, each matched on its own.
   */
  alsoNullColumns?: readonly string[];
  /**
   * `jsonb` columns whose document embeds the raw uuid in free text (correlation ids, callback
   * data, message bodies). Every occurrence is replaced by a fixed non-identifying token; the rest
   * of the document — the delivery outcome this store exists for — is left untouched.
   */
  scrubJsonColumns?: readonly string[];
};

/** Replacement written over a purged person's raw uuid inside a retained JSON document. */
export const PURGED_USER_JSON_TOKEN = 'purged-user';

/**
 * Columns nulled — not deleted — on purge: the ROW is not the purged person's own data (it belongs to
 * the specialist who owns it, or it is a retained delivery fact), only the reference to the purged
 * patient must not survive.
 * Final systemic lifecycle audit 2026-08-28, F2: `specialist_tasks.patient_user_id` carries no FK to
 * `platform_users` at all, so a specialist's task kept pointing at a deleted patient id forever.
 * Exported so the lifecycle registry (`JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS`) can name exactly this
 * mechanism instead of a second, undeclared one.
 */
export const ANONYMISE_ON_PURGE_COLUMNS: AnonymiseOnPurgeTarget[] = [
  { table: 'specialist_tasks', column: 'patient_user_id' },
  // Exhaustive lifecycle census 2026-08-28: both carry a `platform_user_id` that IS the patient
  // (`pgPayments.createPaymentFromIntent` copies it straight from the intent; `pgClientHistory`
  // reads the history rows as that patient's payment history) and neither column has an FK, so the
  // raw id of a purged patient stayed on a row accounting keeps. The policy is not invented here:
  // the column this value is copied FROM — `be_payment_intents.platform_user_id` — already carries
  // an owner-decided `ON DELETE SET NULL`, as does `be_appointments.platform_user_id`. The money
  // record is retained; the person is not.
  { table: 'be_payments', column: 'platform_user_id' },
  { table: 'be_payment_history_events', column: 'platform_user_id' },
  // Exhaustive lifecycle census audit 2026-08-28, F1. This journal is a RETAINED 180-day delivery
  // fact, not a second account record: it carries no message text of its own, `recipient_ref` is
  // already digested (`tg:…1234`, `email:<digest>`), and the diagnostics it feeds are the reason it
  // exists. What it did carry was the person, on three independent live surfaces — `user_id`
  // (7044 rows / 36 clients on bcb_webapp_dev), `integrator_user_id`, written separately by the
  // integrator repo (537 / 110), and the raw uuid embedded in `metadata` by the nonqueue-attempt
  // path (1956 / 41) — with no purge step at all. The owner's decision (brief finding 1) is the one
  // already taken for `product_analytics_events_recent`: keep the outcome, drop the person, and let
  // the row die on its own 180-day sweep. Nothing else in the journal is touched and no second
  // journal is created.
  {
    table: 'notification_delivery_attempts',
    column: 'user_id',
    alsoNullColumns: ['integrator_user_id'],
    scrubJsonColumns: ['metadata'],
  },
];

/**
 * Diary relations emptied by `deleteSymptomAndLfkDiaryForUser` — a second explicit-delete list, kept
 * apart from `CONTENT_TABLES` only because their FK order forces a hand-written sequence. Exported
 * for the same reason `CONTENT_TABLES` is: the lifecycle registry declares `explicit-delete` for
 * them, and that declaration must be checkable against the code that performs it.
 */
export const DIARY_TABLES: { table: string; column: string }[] = [
  { table: 'lfk_complexes', column: 'user_id' },
  { table: 'symptom_trackings', column: 'user_id' },
];

/** Дневники симптомов и ЛФК: порядок как в `pgDiaryPurge` (FK `lfk_complexes.symptom_tracking_id` → `symptom_trackings`). */
async function deleteSymptomAndLfkDiaryForUser(client: PoolClient, userId: string): Promise<void> {
  await runPurgeClientPgText(
    client,
    `UPDATE lfk_complexes SET symptom_tracking_id = NULL, updated_at = now() WHERE user_id = $1`,
    [userId],
  );
  for (const { table, column } of DIARY_TABLES) {
    await runPurgeClientPgText(client, `DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
  }
}

/** Login/identity rows deleted by the purge core; exported for the same declaration check. */
export const IDENTITY_TABLES: { table: string; column: string }[] = [
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
       SELECT platform_user_id::text FROM user_contacts
       WHERE contact_kind = 'phone'
         AND regexp_replace(value_normalized, '\\D', '', 'g') = $1
     )
        OR platform_user_id IN (
          SELECT platform_user_id FROM user_contacts
          WHERE contact_kind = 'phone'
            AND regexp_replace(value_normalized, '\\D', '', 'g') = $1
        )`,
    [digs],
  );
}

/**
 * Fails the whole purge closed when the account id is also the identity root of another persona.
 * Runs FIRST, before any statement that changes anything: a purge that deletes the platform
 * identity and leaves the same raw uuid owning an active specialist card, its schedule and its
 * appointments is not a purge, and the half-done state cannot be undone from outside a transaction.
 */
async function assertNoBlockingIdentityRoot(client: PoolClient, userId: string): Promise<void> {
  const conflicts: string[] = [];
  for (const { table, column, reason } of IDENTITY_ROOT_TABLES) {
    const res = await runPurgeClientPgText<{ n: string }>(
      client,
      `SELECT count(*)::text AS n FROM ${table} WHERE ${column} = $1`,
      [userId],
    );
    if (Number.parseInt(res.rows[0]?.n ?? '0', 10) > 0) {
      conflicts.push(`${table}.${column}: ${reason}`);
    }
  }
  if (conflicts.length > 0) throw new PurgeIdentityRootConflictError(conflicts);
}

async function anonymisePurgedUserReferences(client: PoolClient, userId: string): Promise<void> {
  for (const target of ANONYMISE_ON_PURGE_COLUMNS) {
    const nullColumns = [target.column, ...(target.alsoNullColumns ?? [])];
    const scrubColumns = target.scrubJsonColumns ?? [];
    const assignments = [
      ...nullColumns.map((col) => `${col} = CASE WHEN ${col}::text = $1 THEN NULL ELSE ${col} END`),
      // The uuid appears inside string VALUES of the document (correlation ids, callback data,
      // message bodies), never as structure, so a textual replacement keeps the document valid and
      // reaches every nesting depth without guessing a key path.
      ...scrubColumns.map(
        (col) => `${col} = replace(${col}::text, $1, '${PURGED_USER_JSON_TOKEN}')::jsonb`,
      ),
    ].join(', ');
    const matches = [
      ...nullColumns.map((col) => `${col}::text = $1`),
      ...scrubColumns.map((col) => `position($1 in ${col}::text) > 0`),
    ].join(' OR ');
    await runPurgeClientPgText(
      client,
      `UPDATE ${target.table} SET ${assignments} WHERE ${matches}`,
      [userId],
    );
  }
}

async function clearPlatformUserDeleteBlockers(client: PoolClient, userId: string): Promise<void> {
  await anonymisePurgedUserReferences(client, userId);
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
  role: string;
};

/**
 * Core webapp DELETE sequence (single transaction). Caller must hold advisory lock and have called `collectPurgeArtifactKeys` first when strict S3 cleanup is required.
 */
export async function runWebappPurgeCoreInTransaction(
  client: PoolClient,
  user: PurgePlatformUserRow,
): Promise<void> {
  await assertNoBlockingIdentityRoot(client, user.id);

  if (user.phone_normalized?.trim()) {
    await deletePhoneKeyedWebappRows(client, user.phone_normalized);
  }

  await clearPlatformUserDeleteBlockers(client, user.id);
  await deleteSymptomAndLfkDiaryForUser(client, user.id);
  await deleteContentTablesForUser(client, user.id);

  // `message_log.platform_user_id` is now a `CONTENT_TABLES` row, so only the legacy TEXT column of
  // the same table is left here. The set of deleted rows is exactly what it was.
  await runPurgeClientPgText(client, `DELETE FROM message_log WHERE user_id = $1::text`, [user.id]);

  for (const { table, column } of IDENTITY_TABLES) {
    await runPurgeClientPgText(client, `DELETE FROM ${table} WHERE ${column} = $1`, [user.id]);
  }

  await runPurgeClientPgText(client, `DELETE FROM platform_users WHERE id = $1`, [user.id]);
}

/** Mirrors `runStrictPurgePlatformUser` — see `strictPlatformUserPurge.ts`. */
export type StrictPurgeOutcome = 'completed' | 'partial_failed';

export type PurgePlatformUserResult =
  | { ok: true; outcome?: StrictPurgeOutcome }
  | {
      ok: false;
      error:
        | 'invalid_uuid'
        | 'not_found'
        | 'not_client'
        | 'identity_in_use'
        | 'transaction_failed';
    };

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
    outcome: r.outcome,
  };
}

async function loadPurgeUserRow(db: Pool, id: string): Promise<PurgePlatformUserRow | null> {
  const userRes = await runPurgePoolPgText<PurgePlatformUserRow>(
    db,
    `SELECT pu.id, ${CONTACTS.phoneNormalized} AS phone_normalized, pu.role
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
